import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { buildBayeCorePrompt, getCoreInfo } from './baye-core.js';

const app = express();
app.set('trust proxy', 1); // Render proxy
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
const allowedOrigin = process.env.BAYE_ORIGIN || 'https://baye-app.onrender.com';
app.use(cors({origin: allowedOrigin, methods:['POST','GET'], allowedHeaders:['Content-Type']}));
app.use('/api/', rateLimit({windowMs:60_000, max:20, standardHeaders:true, legacyHeaders:false}));
app.get('/health', (_req,res)=>res.json({status:'ok',service:'BAYE AI gateway',core:getCoreInfo()}));
app.post('/api/generate', async (req,res)=>{
  try {
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Écris une demande avant de générer.'});
    if(prompt.length>8000) return res.status(400).json({error:'Demande trop longue (maximum 8 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key) return res.status(503).json({error:'Le moteur IA n’est pas encore configuré. Réessaie plus tard.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    const system=buildBayeCorePrompt(kind);
    const messages=[{role:'system',content:system},{role:'user',content:prompt}];
    let output='';
    let finishReason='';
    // Continue automatically when the provider reports a token-limit truncation, up to 2 continuation calls.
    for(let part=0;part<3;part++){
      const upstream=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,messages,temperature:0.7,max_tokens:8192})});
      if(!upstream.ok){const detail=await upstream.text(); console.error('AI provider error',upstream.status,detail.slice(0,500)); return res.status(502).json({error:'Le moteur IA rencontre un problème. Réessaie plus tard.'});}
      const data=await upstream.json();
      const choice=data?.choices?.[0];
      const piece=choice?.message?.content;
      if(typeof piece!=='string'||!piece.trim()) return res.status(502).json({error:'Réponse IA vide. Réessaie.'});
      output+=piece;
      finishReason=choice?.finish_reason||'stop';
      if(finishReason!=='length'||part===2) break;
      messages.push({role:'assistant',content:piece},{role:'user',content:'Continue exactement à partir de la fin de ta réponse précédente. Ne répète aucun contenu. Termine les fichiers et les explications manquants.'});
    }
    res.json({result:output,model,core:getCoreInfo(),partial:finishReason==='length'});
  } catch(err){console.error('BAYE gateway error',err);res.status(500).json({error:'Erreur interne. Réessaie plus tard.'});}
});

const falModels = {
  image: 'fal-ai/flux/schnell',
  video: 'fal-ai/kling-video/v2.1/standard/text-to-video'
};
app.post('/api/media/generate', async (req,res)=>{
  try {
    const falKey=process.env.FAL_KEY;
    if(!falKey) return res.status(503).json({error:'Le service de génération média n’est pas configuré.'});
    const {prompt,type='image',image_url}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Prompt requis.'});
    if(prompt.length>4000) return res.status(400).json({error:'Prompt trop long (maximum 4 000 caractères).'});
    if(!['image','video'].includes(type)) return res.status(400).json({error:'Type invalide.'});
    if(type==='video'&&image_url&&typeof image_url!=='string') return res.status(400).json({error:'URL image invalide.'});
    const model=falModels[type];
    const payload={prompt};
    if(type==='video'&&image_url) payload.image_url=image_url;
    const upstream=await fetch('https://queue.fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+falKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!upstream.ok){const detail=await upstream.text();console.error('fal submission error',upstream.status,detail.slice(0,300));return res.status(502).json({error:'fal.ai ne peut pas accepter la demande pour le moment.'});}
    const data=await upstream.json();
    res.json({request_id:data.request_id,model,type,status_url:'/api/media/status?type='+type+'&request_id='+encodeURIComponent(data.request_id)});
  }catch(err){console.error('BAYE media error',err);res.status(500).json({error:'Erreur interne du générateur média.'});}
});
app.get('/api/media/status', async (req,res)=>{
  try{
    const falKey=process.env.FAL_KEY;
    if(!falKey) return res.status(503).json({error:'Service média non configuré.'});
    const {type,request_id}=req.query;
    if(!['image','video'].includes(type)||typeof request_id!=='string'||! /^[a-zA-Z0-9_-]{1,200}$/.test(request_id)) return res.status(400).json({error:'Paramètres invalides.'});
    const model=falModels[type];
    const statusRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id+'/status',{headers:{Authorization:'Key '+falKey}});
    if(!statusRes.ok)return res.status(502).json({error:'Impossible de vérifier la génération.'});
    const status=await statusRes.json();
    if(status.status!=='COMPLETED')return res.json({status:status.status});
    const resultRes=await fetch('https://queue.fal.run/'+model+'/requests/'+request_id,{headers:{Authorization:'Key '+falKey}});
    if(!resultRes.ok)return res.status(502).json({error:'Résultat indisponible.'});
    const result=await resultRes.json();
    res.json({status:'COMPLETED',result});
  }catch(err){console.error('BAYE media status error',err);res.status(500).json({error:'Erreur interne de vérification.'});}
});

const port=process.env.PORT||10000;
app.listen(port,'0.0.0.0',()=>console.log('BAYE AI gateway listening on '+port));
