import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { buildBayeCorePrompt, getCoreInfo } from './baye-core.js';
import { runMonitor } from './baye-monitor.js';

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
app.use('/api/', rateLimit({windowMs:60_000, max:20, standardHeaders:true, legacyHeaders:false}));
app.get('/health', (_req,res)=>res.json({status:'ok',service:'BAYE AI gateway',core:getCoreInfo()}));


// BAYE autonomous monitoring: restricted endpoint; secret must be configured in Render.
app.get('/api/monitor/check', async (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(!secret) return res.status(503).json({error:'Monitoring access secret not configured'});
  if(req.get('authorization') !== 'Bearer '+secret) return res.status(401).json({error:'Unauthorized'});
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

async function callAI({key,endpoint,model,messages,max_tokens=4096,temperature=0.4}){
  const upstream=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,messages,max_tokens,temperature})});
  if(!upstream.ok){const detail=await upstream.text();console.error('AI provider error',upstream.status,detail.slice(0,500));throw new Error('provider');}
  const data=await upstream.json();
  const choice=data?.choices?.[0],piece=choice?.message?.content;
  if(typeof piece!=='string'||!piece.trim())throw new Error('empty');
  return {piece,finishReason:choice.finish_reason||'stop'};
}
app.post('/api/generate', async (req,res)=>{
  try {
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Écris une demande avant de générer.'});
    if(prompt.length>8000) return res.status(400).json({error:'Demande trop longue (maximum 8 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key) return res.status(503).json({error:'Le moteur IA n’est pas encore configuré. Réessaie plus tard.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    let output='',finishReason='stop';
    const messages=[{role:'system',content:buildBayeCorePrompt(kind)},{role:'user',content:prompt}];
    for(let part=0;part<3;part++){
      const response=await callAI({key,endpoint,model,messages,max_tokens:8192,temperature:0.7});
      output+=response.piece;finishReason=response.finishReason;
      if(finishReason!=='length'||part===2)break;
      messages.push({role:'assistant',content:response.piece},{role:'user',content:'Continue exactly where you stopped, without repeating. Complete the answer.'});
    }
    res.json({result:output,model,core:getCoreInfo(),partial:finishReason==='length'});
  } catch(err){console.error('BAYE gateway error',err);res.status(502).json({error:'Le moteur IA rencontre un problème. Réessaie plus tard.'});}
});

// BAYE Agent: two-call cost-conscious workflow (plan + final with built-in quality review).
app.post('/api/agent', async (req,res)=>{
  try{
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim())return res.status(400).json({error:'Écris un objectif avant de lancer BAYE Agent.'});
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
    const finalResponse=await callAI({key,endpoint,model,messages:[
      {role:'system',content:buildBayeCorePrompt(kind)+' Tu es BAYE Agent. Réalise le plan fourni. Avant de répondre, vérifie silencieusement les erreurs, omissions, contradictions, sécurité et affirmations non vérifiées; corrige-les. Ne prétends pas avoir réalisé d actions externes ni consulté des sources. Retourne directement la réponse finale.'},
      {role:'user',content:'Objectif : '+prompt+'\\nPlan :\\n'+plan}
    ],max_tokens:4500,temperature:0.4});
    res.json({result:finalResponse.piece,plan,model,core:{...getCoreInfo(),agentMode:'plan-and-integrated-review',steps:2},verifiedByReview:true});
  }catch(err){console.error('BAYE agent error',err);res.status(502).json({error:'BAYE Agent n’a pas pu terminer. Réessaie plus tard.'});}
});
const falModels = {image:'fal-ai/flux/schnell',video:'fal-ai/kling-video/v2.1/standard/text-to-video'};
app.post('/api/media/generate', async (req,res)=>{
  try {
    const falKey=process.env.FAL_KEY;
    if(!falKey) return res.status(503).json({error:'Le service de génération média n’est pas configuré.'});
    const {prompt,type='image',image_url}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Prompt requis.'});
    if(prompt.length>4000) return res.status(400).json({error:'Prompt trop long (maximum 4 000 caractères).'});
    if(!['image','video'].includes(type)) return res.status(400).json({error:'Type invalide.'});
    if(type==='video'&&image_url){
      if(typeof image_url!=='string'||image_url.length>2048)return res.status(400).json({error:'URL image invalide.'});
      try{const parsed=new URL(image_url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return res.status(400).json({error:'L’image doit utiliser une URL HTTPS valide.'});}
      catch{return res.status(400).json({error:'URL image invalide.'});}
    }
    const model=falModels[type],payload={prompt};if(type==='video'&&image_url)payload.image_url=image_url;
    const upstream=await fetch('https://queue.fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+falKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!upstream.ok){const detail=await upstream.text();console.error('fal submission error',upstream.status,detail.slice(0,300));return res.status(502).json({error:'fal.ai ne peut pas accepter la demande pour le moment.'});}
    const data=await upstream.json();res.json({request_id:data.request_id,model,type,status_url:'/api/media/status?type='+type+'&request_id='+encodeURIComponent(data.request_id)});
  }catch(err){console.error('BAYE media error',err);res.status(500).json({error:'Erreur interne du générateur média.'});}
});
app.get('/api/media/status', async (req,res)=>{
  try{
    const falKey=process.env.FAL_KEY;if(!falKey)return res.status(503).json({error:'Service média non configuré.'});
    const {type,request_id}=req.query;if(!['image','video'].includes(type)||typeof request_id!=='string'||! /^[a-zA-Z0-9_-]{1,200}$/.test(request_id))return res.status(400).json({error:'Paramètres invalides.'});
    const model=falModels[type];const statusRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id+'/status',{headers:{Authorization:'Key '+falKey}});
    if(!statusRes.ok)return res.status(502).json({error:'Impossible de vérifier la génération.'});
    const status=await statusRes.json();if(status.status!=='COMPLETED')return res.json({status:status.status});
    const resultRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id,{headers:{Authorization:'Key '+falKey}});
    if(!resultRes.ok)return res.status(502).json({error:'Résultat indisponible.'});
    const result=await resultRes.json();res.json({status:'COMPLETED',result});
  }catch(err){console.error('BAYE media status error',err);res.status(500).json({error:'Erreur interne de vérification.'});}
});
const port=process.env.PORT||10000;app.listen(port,'0.0.0.0',()=>console.log('BAYE AI gateway listening on '+port));
