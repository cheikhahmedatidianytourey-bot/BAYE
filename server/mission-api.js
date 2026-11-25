import express from 'express';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import {createMission} from './mission-engine.js';

function secureBearerMatch(req,secret){
  if(typeof secret!=='string'||secret.length<32)return false;
  const supplied=req.get('authorization')||'';
  const expected='Bearer '+secret;
  return supplied.length===expected.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}

function publicMission(m){
  return {id:m.id,goal:m.goal,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt,lastHeartbeatAt:m.lastHeartbeatAt,tasks:m.tasks,checkpoint:m.checkpoint,retry:m.retry,audit:m.audit};
}

export function createMissionRouter({store,worker,token,directory=store?.directory,rateLimiter=null}={}){
  if(!store||typeof store.create!=='function'||typeof store.get!=='function'||typeof store.list!=='function')throw new TypeError('Mission store is required.');
  if(!worker||typeof worker.runOne!=='function')throw new TypeError('Mission worker is required.');
  const router=express.Router();
  const limiter=rateLimiter||rateLimit({windowMs:60_000,max:10,standardHeaders:true,legacyHeaders:false});
  function requireMissionAuth(req,res,next){
    if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Mission API token is not securely configured.'});
    if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});
    next();
  }

  router.get('/status',requireMissionAuth,(_req,res)=>res.json({enabled:true,execution:'bounded AI text tasks only',storage:directory,limits:{tasksPerMission:10,descriptionChars:1000,runRequestsPerMinute:10,maxAttempts:2},externalActions:false}));
  router.post('/',limiter,requireMissionAuth,async(req,res)=>{
    try{
      const {goal,tasks,constraints={}}=req.body||{};
      if(typeof goal!=='string'||!goal.trim()||goal.length>3000)return res.status(400).json({error:'Goal must be 1-3000 characters.'});
      if(!Array.isArray(tasks)||tasks.length<1||tasks.length>10)return res.status(400).json({error:'Provide 1-10 tasks.'});
      if(tasks.some(t=>!t||typeof t.description!=='string'||!t.description.trim()||t.description.length>1000))return res.status(400).json({error:'Each task description must be 1-1000 characters.'});
      if(!constraints||typeof constraints!=='object'||Array.isArray(constraints))return res.status(400).json({error:'Invalid constraints.'});
      const mission=createMission({goal,ownerRef:'api-user',constraints,tasks});
      await store.create(mission);
      res.status(201).json(publicMission(mission));
    }catch(err){res.status(400).json({error:err.message||'Invalid mission.'});}
  });
  router.get('/',requireMissionAuth,async(_req,res)=>{
    try{const items=(await store.list()).filter(m=>m.ownerRef==='api-user').map(publicMission);res.json({items});}
    catch(_){res.status(500).json({error:'Mission list unavailable.'});}
  });
  router.get('/:id',requireMissionAuth,async(req,res)=>{
    try{const m=await store.get(req.params.id);if(!m||m.ownerRef!=='api-user')return res.status(404).json({error:'Mission not found.'});res.json(publicMission(m));}
    catch(_){res.status(400).json({error:'Invalid mission ID.'});}
  });
  router.post('/:id/run',limiter,requireMissionAuth,async(req,res)=>{
    try{const m=await store.get(req.params.id);if(!m||m.ownerRef!=='api-user')return res.status(404).json({error:'Mission not found.'});const result=await worker.runOne(m.id);const updated=await store.get(m.id);res.json({worker:result,mission:publicMission(updated)});}
    catch(err){res.status(500).json({error:err.message||'Mission execution failed.'});}
  });
  return router;
}
