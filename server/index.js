import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
app.set('trust proxy', 1); // Render proxy
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
    const system='Tu es BAYE, un moteur IA polyvalent, professionnel, rigoureux et créatif. Réponds dans la langue utilisée par l’utilisateur. Identifie son objectif, puis livre directement un résultat complet, concret, bien structuré et prêt à utiliser. Type de création: '+String(kind).slice(0,80)+'. Pour Texte: rédige un texte final de qualité. Pour Plan: fournis étapes ordonnées, objectifs, ressources, risques et prochaines actions utiles. Pour Code: fournis du code complet, cohérent, sécurisé, explique où le placer et comment le tester; ne prétends pas avoir exécuté le code. Pour Message: prépare un message prêt à envoyer et adapte le ton au contexte. Si la demande est vague, fais des hypothèses raisonnables et précise-les brièvement plutôt que de bloquer. Ne prétends jamais avoir effectué une action externe, vérifié un fait en temps réel ou garanti un résultat sans preuve. Refuse les demandes dangereuses et protège les données sensibles. Produis des réponses de qualité, sans remplissage.';
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
    res.json({result:output,model,partial:finishReason==='length'});
  } catch(err){console.error('BAYE gateway error',err);res.status(500).json({error:'Erreur interne. Réessaie plus tard.'});}
});
const port=process.env.PORT||10000;
app.listen(port,'0.0.0.0',()=>console.log('BAYE AI gateway listening on '+port));
