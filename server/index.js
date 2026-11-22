import express from 'express';
import crypto from 'node:crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { buildBayeCorePrompt, getCoreInfo } from './baye-core.js';
import { buildMissionPlan, getIndependentCoreStatus } from './independent-core.js';
import { runOwnedRuntime } from './owned-runtime.js';
import { executeSafeTool, getSafeToolCatalog } from './tool-execution.js';
import { runSafeWorkflow, getWorkflowLimits } from './safe-workflow.js';
import { MemoryEngine } from './memory-engine.js';
import { runMonitor, startPeriodicMonitor, getMonitorStatus, getMonitorHistory } from './baye-monitor.js';
import { createAcademyRouter } from './academy/router.js';
import { buildDomainSystemPrompt, getBayeCapabilityCatalog } from './ai/domain-router.js';
import { requestAICompletion, getAIProviderStatus } from './ai/provider-adapter.js';
import { generateCloudflareImage, getMediaProviderStatus } from './ai/media-adapter.js';
import { verifyTextOutput } from './verification-layer.js';
import { validatePublicImageUrl } from './ai/image-url-validation.js';
import { readJsonLimited } from './ai/bounded-json.js';
import { buildOperationalAudit } from './operational-audit.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// Baseline security headers for API responses.
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({limit:'20kb'}));
const allowedOrigin = process.env.BAYE_ORIGIN || 'https://baye-app.onrender.com';
app.use(cors({origin: allowedOrigin, methods:['POST','GET'], allowedHeaders:['Content-Type','Authorization']}));
app.use('/api/', (req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use('/api/', rateLimit({windowMs:60_000, max:30, standardHeaders:true, legacyHeaders:false}));
const generationLimiter=rateLimit({windowMs:60_000,max:8,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de demandes de génération. Réessaie dans une minute.'}});
const mediaLimiter=rateLimit({windowMs:60_000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de demandes média. Réessaie dans une minute.'}});
const mediaStatusLimiter=rateLimit({windowMs:60_000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de vérifications média. Réessaie dans une minute.'}});
app.get('/', (_req,res)=>res.type('text').send('BAYE AI CORE — Gateway online. Use /health for system status.'));
app.get('/health', (_req,res)=>res.json({status:'ok',service:'BAYE AI gateway',core:getCoreInfo(),independentCore:getIndependentCoreStatus()}));
app.get('/api/operational-audit',(req,res)=>{const secret=process.env.BAYE_MONITOR_SECRET;if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Audit access secret is not securely configured'});if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});res.json(buildOperationalAudit());});
app.get('/api/independent-core/status',(_req,res)=>res.json(getIndependentCoreStatus()));
app.post('/api/independent-core/runtime',generationLimiter,(req,res)=>{try{res.json(runOwnedRuntime(req.body?.input));}catch(err){res.status(400).json({error:err.message||'Entrée invalide.'});}});
app.get('/api/independent-core/tools',(_req,res)=>res.json({tools:getSafeToolCatalog(),scope:'allowlisted deterministic local tools; no external side effects'}));
app.post('/api/independent-core/tools/execute',generationLimiter,(req,res)=>{try{const tool=req.body?.tool;if(typeof tool!=='string')return res.status(400).json({error:'Outil requis.'});const result=executeSafeTool(tool,req.body?.input||{});res.json({result,verification:{passed:true,scope:'deterministic tool checks'}});}catch(err){res.status(400).json({error:err.message||'Entrée invalide.'});}});
app.get('/api/independent-core/workflow-limits',(_req,res)=>res.json(getWorkflowLimits()));
app.post('/api/independent-core/workflow',generationLimiter,(req,res)=>{try{res.json(runSafeWorkflow(req.body?.steps));}catch(err){res.status(400).json({error:err.message||'Workflow invalide.'});}});
app.post('/api/independent-core/plan',generationLimiter,(req,res)=>{try{const mission=req.body?.mission;if(typeof mission!=='string'||mission.trim().length===0)return res.status(400).json({error:'Mission requise.'});if(mission.length>4000)return res.status(400).json({error:'Mission trop longue (maximum 4 000 caractères).'});res.json(buildMissionPlan(mission));}catch(_err){res.status(400).json({error:'Mission invalide.'});}})

function secureBearerMatch(req,secret){
  if(typeof secret!=='string'||secret.length<32)return false;
  const supplied=req.get('authorization')||'';
  const expected='Bearer '+secret;
  return supplied.length===expected.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}

// BAYE Memory Engine: all write/search access is protected by a separately configured token.
const memoryEngine=new MemoryEngine();
app.use('/api/memory', (req,res,next)=>{
  const token=process.env.BAYE_MEMORY_TOKEN;
  if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Memory access token is not securely configured.'});
  if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});
  next();
});
app.get('/api/memory/status',async(req,res)=>{try{res.json(await memoryEngine.status());}catch(_){res.status(500).json({error:'Memory status unavailable.'});}});
app.get('/api/memory/search',async(req,res)=>{try{res.json({items:await memoryEngine.search(typeof req.query.q==='string'?req.query.q:'')});}catch(err){res.status(400).json({error:err.message});}});
app.post('/api/memory',async(req,res)=>{try{res.status(201).json(await memoryEngine.add(req.body||{}));}catch(err){res.status(400).json({error:err.message});}});
app.delete('/api/memory/:id',async(req,res)=>{try{const removed=await memoryEngine.remove(req.params.id);res.json({removed});}catch(err){res.status(400).json({error:err.message});}});
app.delete('/api/memory',async(req,res)=>{try{await memoryEngine.clear();res.json({cleared:true});}catch(_){res.status(500).json({error:'Unable to clear memory.'});}});

app.get('/api/capabilities', (_req,res)=>res.json({ ...getBayeCapabilityCatalog(), providers: getAIProviderStatus(), media: getMediaProviderStatus() }));


// BAYE autonomous monitoring: restricted endpoint; secret must be configured in Render.
app.get('/api/sentinel/status', (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  res.json(getMonitorStatus());
});
app.get('/api/sentinel/history', (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  res.json({items:getMonitorHistory()});
});
app.get('/api/monitor/check', async (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  try { res.json(await runMonitor()); }
  catch(_err){ res.status(500).json({error:'Monitoring check failed'}); }
});

// BAYE Payments: safe public catalog only; checkout and verification stay disabled until a provider is configured.
app.get('/api/payment-methods', (_req,res)=>res.json({
  paymentSystem:'BAYE Payment Security Core',
  status:'not_configured',
  methods:[
    {id:'wave',name:'Wave',status:'planned'},
    {id:'orange_money',name:'Orange Money',status:'planned'},
    {id:'card',name:'Visa / Mastercard',status:'planned'},
    {id:'paypal',name:'PayPal',status:'planned'},
    {id:'apple_pay',name:'Apple Pay',status:'planned'},
    {id:'google_pay',name:'Google Pay',status:'planned'},
    {id:'djamo',name:'Djamo',status:'needs_provider_validation'}
  ],
  securityPolicy:'No subscription is activated by a user statement, screenshot, or unverified callback. Server-side provider verification is required.'
}));


// BAYE Payment Verification Core v1: verification rules and transaction state primitives.
// Provider webhook verification must be implemented with a provider-specific adapter before live payments.
const paymentStates = new Set(['pending','paid','failed','cancelled','refunded']);
function validatePaymentRecord(record){
  if(!record||typeof record!=='object')return {valid:false,reason:'invalid_record'};
  if(typeof record.transactionId!=='string'||! /^[a-zA-Z0-9_-]{8,200}$/.test(record.transactionId))return {valid:false,reason:'invalid_transaction_id'};
  if(!Number.isSafeInteger(record.amount)||record.amount<=0)return {valid:false,reason:'invalid_amount'};
  if(typeof record.currency!=='string'||! /^[A-Z]{3}$/.test(record.currency))return {valid:false,reason:'invalid_currency'};
  if(!paymentStates.has(record.status))return {valid:false,reason:'invalid_status'};
  return {valid:true};
}
app.post('/api/payment-verification/check-record', (req,res)=>{
  // This endpoint validates record structure only; it does not authenticate a provider payment.
  const result=validatePaymentRecord(req.body);
  res.status(result.valid?200:400).json({valid:result.valid,reason:result.reason||'record_structure_valid',verification:'structure_only',paymentActivationAllowed:false});
});
app.get('/api/payment-verification/status', (_req,res)=>res.json({
  core:'BAYE Payment Verification Core v1',
  mode:'structure_validation_only',
  providerAdaptersConfigured:false,
  livePaymentVerification:false,
  activationRequiresVerifiedProviderWebhook:true,
  checks:['transaction id format','positive integer amount','ISO currency code format','known transaction status'],
  note:'Record validation is not proof of payment. Live activation requires provider authentication, amount/currency/order matching, replay protection, and persistent transaction storage.'
}));


app.use('/api/academy', createAcademyRouter({ callAI }));

async function callAI({key,endpoint,model,messages,max_tokens=4096,temperature=0.4}){
  return requestAICompletion({
    primary: { key, endpoint, model },
    messages,
    max_tokens,
    temperature
  });
}
app.post('/api/generate', generationLimiter, async (req,res)=>{
  try {
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Écris une demande avant de générer.'});
    if(typeof kind!=='string'||kind.length>80)return res.status(400).json({error:'Type de création invalide.'});
    if(prompt.length>8000) return res.status(400).json({error:'Demande trop longue (maximum 8 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key) return res.status(503).json({error:'Le moteur IA n’est pas encore configuré. Réessaie plus tard.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    let output='',finishReason='stop',actualModel=model,providerId='primary';
    const routed = buildDomainSystemPrompt(kind, prompt);
    const messages=[{role:'system',content:routed.systemPrompt},{role:'user',content:prompt}];
    for(let part=0;part<3;part++){
      const response=await callAI({key,endpoint,model,messages,max_tokens:8192,temperature:0.7});
      output+=response.piece;finishReason=response.finishReason;actualModel=response.model||actualModel;providerId=response.providerId||providerId;
      if(finishReason!=='length'||part===2)break;
      messages.push({role:'assistant',content:response.piece},{role:'user',content:'Continue exactly where you stopped, without repeating. Complete the answer.'});
    }
    const outputVerification=verifyTextOutput(output,{label:'generation_result',maxLength:100000});
    if(!outputVerification.passed)return res.status(502).json({error:'BAYE a produit une sortie invalide. Réessaie.',verification:outputVerification});
    res.json({result:output,model:actualModel,provider:providerId,core:getCoreInfo(),domain:routed.route,partial:finishReason==='length',verification:{passed:true,scope:'structural_only',checks:outputVerification.checks}});
  } catch(err){console.error('BAYE gateway error',err);res.status(502).json({error:'Le moteur IA rencontre un problème. Réessaie plus tard.'});}
});

// BAYE Agent: two-call cost-conscious workflow (plan + final with built-in quality review).
app.post('/api/agent', generationLimiter, async (req,res)=>{
  try{
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim())return res.status(400).json({error:'Écris un objectif avant de lancer BAYE Agent.'});
    if(typeof kind!=='string'||kind.length>80)return res.status(400).json({error:'Type de création invalide.'});
    if(prompt.length>4000)return res.status(400).json({error:'Objectif trop long (maximum 4 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key)return res.status(503).json({error:'Le moteur IA n’est pas configuré.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    const planResponse=await callAI({key,endpoint,model,messages:[
      {role:'system',content:'Tu es BAYE Agent, planificateur. Transforme l’objectif en plan bref de 3 à 5 étapes réalisables en génération de texte uniquement. Ne planifie aucune action externe, aucun achat, aucune publication, aucune modification de compte ni commande système. Retourne une liste numérotée simple.'},
      {role:'user',content:prompt}
    ],max_tokens:900,temperature:0.2});
    const plan=planResponse.piece;
    const planVerification=verifyTextOutput(plan,{label:'plan',maxLength:12000});
    if(!planVerification.passed)return res.status(502).json({error:'BAYE Agent a produit un plan invalide. Réessaie.',verification:planVerification});
    const finalResponse=await callAI({key,endpoint,model,messages:[
      {role:'system',content:buildBayeCorePrompt(kind)+' Tu es BAYE Agent. Réalise le plan fourni. Avant de répondre, vérifie silencieusement les erreurs, omissions, contradictions, sécurité et affirmations non vérifiées; corrige-les. Ne prétends pas avoir réalisé d actions externes ni consulté des sources. Retourne directement la réponse finale.'},
      {role:'user',content:'Objectif : '+prompt+'\nPlan :\n'+plan}
    ],max_tokens:4500,temperature:0.4});
    const outputVerification=verifyTextOutput(finalResponse.piece,{label:'final_response',maxLength:40000});
    if(!outputVerification.passed)return res.status(502).json({error:'BAYE Agent a produit une réponse invalide. Réessaie.',verification:outputVerification});
    res.json({result:finalResponse.piece,plan,model:finalResponse.model||model,provider:finalResponse.providerId||'primary',core:{...getCoreInfo(),agentMode:'prompted-review-plus-structural-verification',steps:2},verification:{passed:true,scope:'structural_only',plan:planVerification,result:outputVerification}});
  }catch(err){console.error('BAYE agent error',err);res.status(502).json({error:'BAYE Agent n’a pas pu terminer. Réessaie plus tard.'});}
});
const falModels = {image:'fal-ai/flux/schnell',video:'fal-ai/kling-video/v2.1/standard/text-to-video'};
app.post('/api/media/generate', mediaLimiter, async (req,res)=>{
  try {
    const {prompt,type='image',image_url}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Prompt requis.'});
    if(prompt.length>2048) return res.status(400).json({error:'Prompt trop long (maximum 2 048 caractères pour le modèle image).'});
    if(!['image','video'].includes(type)) return res.status(400).json({error:'Type invalide.'});
    if(type==='image'){
      const generated=await generateCloudflareImage({prompt:prompt.trim()});
      return res.json(generated);
    }
    const falKey=process.env.FAL_KEY;
    if(!falKey) return res.status(503).json({code:'VIDEO_PROVIDER_NOT_CONFIGURED',error:'La génération vidéo nécessite la configuration d’un fournisseur vidéo. Aucun coût ne sera déclenché automatiquement.'});
    if(image_url){
      if(typeof image_url!=='string'||image_url.length>2048||!validatePublicImageUrl(image_url))return res.status(400).json({error:'L’image doit utiliser une URL HTTPS publique valide, sans port ni adresse locale.'});
    }
    const model=falModels.video,payload={prompt:prompt.trim()};if(image_url)payload.image_url=image_url;
    const upstream=await fetch('https://queue.fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+falKey,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
    if(!upstream.ok){console.warn('fal video submission rejected',upstream.status);return res.status(502).json({code:'MEDIA_PROVIDER_REJECTED',error:'Le fournisseur vidéo externe a refusé cette demande. BAYE n’a pas pu lancer cette génération.'});}
    const data=await readJsonLimited(upstream);if(typeof data?.request_id!=='string'||! /^[a-zA-Z0-9_-]{1,200}$/.test(data.request_id))return res.status(502).json({error:'Le fournisseur vidéo a retourné un identifiant invalide.'});res.json({request_id:data.request_id,model,type,status_url:'/api/media/status?type=video&request_id='+encodeURIComponent(data.request_id)});
  }catch(err){
    if(err?.code==='MEDIA_NOT_CONFIGURED')return res.status(503).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_INVALID_PROMPT')return res.status(400).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_QUOTA_EXHAUSTED')return res.status(429).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_PROVIDER_REJECTED'||err?.code==='MEDIA_EMPTY_RESULT'){
      // Provider details contain only Cloudflare error codes/messages, never request headers or secrets.
      console.warn('BAYE Cloudflare image rejection',JSON.stringify({status:err.status||null,code:err.code,providerErrors:err.providerErrors||[]}));
      return res.status(502).json({
        code:err.code,
        error:err.message,
        provider_status:err.status||null,
        provider_errors:err.providerErrors||[]
      });
    }
    console.error('BAYE media error',err);res.status(500).json({error:'Erreur interne du générateur média.'});
  }
});
app.get('/api/media/status', mediaStatusLimiter, async (req,res)=>{
  try{
    const falKey=process.env.FAL_KEY;if(!falKey)return res.status(503).json({error:'Service vidéo non configuré.'});
    const {type,request_id}=req.query;if(type!=='video'||typeof request_id!=='string'||! /^[a-zA-Z0-9_-]{1,200}$/.test(request_id))return res.status(400).json({error:'Paramètres invalides.'});
    const model=falModels.video;const statusRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id+'/status',{headers:{Authorization:'Key '+falKey},signal:AbortSignal.timeout(20000)});
    if(!statusRes.ok)return res.status(502).json({error:'Impossible de vérifier la génération.'});
    const status=await readJsonLimited(statusRes,1024*1024);if(status.status!=='COMPLETED')return res.json({status:status.status});
    const resultRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id,{headers:{Authorization:'Key '+falKey},signal:AbortSignal.timeout(20000)});
    if(!resultRes.ok)return res.status(502).json({error:'Résultat indisponible.'});
    const result=await readJsonLimited(resultRes);res.json({status:'COMPLETED',result});
  }catch(err){console.error('BAYE media status error',err);res.status(500).json({error:'Erreur interne de vérification.'});}
});
// Normalize unexpected errors without exposing stack traces or secrets to clients.
app.use((err,req,res,next)=>{console.error('Unhandled API error',err?.message||err);if(res.headersSent)return next(err);res.status(500).json({error:'Erreur interne. Réessaie plus tard.'});});
const port=process.env.PORT||10000;app.listen(port,'0.0.0.0',()=>{console.log('BAYE AI gateway listening on '+port);startPeriodicMonitor();});
