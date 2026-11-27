import { submitVideo, checkVideoStatus } from './video-queue-adapter.js';
import { validatePublicImageUrl } from './image-url-validation.js';

export function createVideoSubmitHandler({ getKey=()=>process.env.FAL_KEY, validateImage=validatePublicImageUrl, fetchImpl=fetch }={}) {
 return async (req,res)=>{
  try {
   const {prompt,image_url}=req.body||{};
   if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Prompt requis.'});
   if(prompt.length>2048) return res.status(400).json({error:'Prompt trop long (maximum 2 048 caractères).'});
   const key=getKey();
   if(!key) return res.status(503).json({code:'VIDEO_PROVIDER_NOT_CONFIGURED',error:'La génération vidéo nécessite la configuration d’un fournisseur vidéo.'});
   if(image_url&&(typeof image_url!=='string'||image_url.length>2048||!(await validateImage(image_url)))) return res.status(400).json({error:'L’image doit utiliser une URL HTTPS publique valide, sans port ni adresse locale.'});
   const result=await submitVideo({prompt:prompt.trim(),image_url,apiKey:key,fetchImpl:(url,opts)=>fetchImpl(url,{...opts,signal:AbortSignal.timeout(45000)})});
   return res.json(result);
  } catch(err) {
   if(err?.code==='INVALID_PROMPT') return res.status(400).json({code:err.code,error:'Prompt invalide.'});
   if(err?.code==='NOT_CONFIGURED') return res.status(503).json({code:err.code,error:'Service vidéo non configuré.'});
   if(err?.code==='PROVIDER_REJECTED') return res.status(502).json({code:err.code,error:'Le fournisseur vidéo a refusé la demande.'});
   if(err?.code==='RESPONSE_TOO_LARGE'||err?.code==='INVALID_REQUEST_ID') return res.status(502).json({code:err.code,error:'Réponse fournisseur invalide.'});
   return res.status(500).json({error:'Erreur interne du générateur vidéo.'});
  }
 };
}
export function createVideoStatusHandler({ getKey=()=>process.env.FAL_KEY, fetchImpl=fetch }={}) {
 return async (req,res)=>{
  try {
   const key=getKey(); if(!key) return res.status(503).json({error:'Service vidéo non configuré.'});
   const {type,request_id}=req.query;
   if(type!=='video'||typeof request_id!=='string'||! /^[a-zA-Z0-9_-]{1,200}$/.test(request_id)) return res.status(400).json({error:'Paramètres invalides.'});
   const result=await checkVideoStatus({request_id,apiKey:key,fetchImpl:(url,opts)=>fetchImpl(url,{...opts,signal:AbortSignal.timeout(20000)})});
   return res.json(result);
  }catch(err){
   const status=err?.code==='INVALID_REQUEST_ID'?400:err?.code==='STATUS_FAILED'||err?.code==='RESULT_FAILED'||err?.code==='RESPONSE_TOO_LARGE'||err?.code==='INVALID_STATUS'?502:500;
   return res.status(status).json({error:status===502?'Impossible de vérifier ou récupérer le résultat vidéo.':'Erreur interne de vérification.'});
  }
 };
}
