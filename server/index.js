import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
const allowedOrigin = process.env.BAYE_ORIGIN || 'https://baye-app.onrender.com';
app.use(cors({origin: allowedOrigin, methods:['POST','GET'], allowedHeaders:['Content-Type']}));
app.use('/api/', rateLimit({windowMs:60_000, max:20, standardHeaders:true, legacyHeaders:false}));
app.get('/health', (_req,res)=>res.json({status:'ok',service:'BAYE AI gateway'}));
app.post('/api/generate', async (req,res)=>{
  try {
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Écris une demande avant de générer.'});
    if(prompt.length>8000) return res.status(400).json({error:'Demande trop longue (maximum 8 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key) return res.status(503).json({error:'Le moteur IA n’est pas encore configuré. Réessaie plus tard.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    const system='Tu es BAYE, un assistant de création utile, précis et sûr. Réponds dans la langue de l’utilisateur. Produis une réponse concrète, structurée et directement exploitable. Type de création demandé: '+String(kind).slice(0,80)+'. Ne prétends pas exécuter des actions que tu n’as pas réellement effectuées.';
    const upstream=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:prompt}],temperature:0.7})});
    if(!upstream.ok){const detail=await upstream.text(); console.error('AI provider error',upstream.status,detail.slice(0,500)); return res.status(502).json({error:'Le moteur IA rencontre un problème. Réessaie plus tard.'});}
    const data=await upstream.json();
    const output=data?.choices?.[0]?.message?.content;
    if(typeof output!=='string'||!output.trim()) return res.status(502).json({error:'Réponse IA vide. Réessaie.'});
    res.json({result:output,model});
  } catch(err){console.error('BAYE gateway error',err);res.status(500).json({error:'Erreur interne. Réessaie plus tard.'});}
});
const port=process.env.PORT||10000;
app.listen(port,'0.0.0.0',()=>console.log('BAYE AI gateway listening on '+port));
