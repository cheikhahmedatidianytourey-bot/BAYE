import express from 'express';
import rateLimit from 'express-rate-limit';
import {createMission} from './mission-engine.js';

function publicMission(m){
  return {
    id:m.id,
    goal:m.goal,
    status:m.status,
    createdAt:m.createdAt,
    updatedAt:m.updatedAt,
    tasks:m.tasks.map(task=>({
      id:task.id,
      order:task.order,
      description:task.description,
      status:task.status,
      dependencies:task.dependencies,
      attempt:task.attempt,
      createdAt:task.createdAt,
      updatedAt:task.updatedAt
    }))
  };
}

export function createMissionRouter({store,worker,authenticate,rateLimiter=null}={}){
  if(!store||typeof store.create!=='function'||typeof store.get!=='function'||typeof store.list!=='function')throw new TypeError('Mission store is required.');
  if(!worker||typeof worker.runOne!=='function')throw new TypeError('Mission worker is required.');
  const router=express.Router();
  const limiter=rateLimiter||rateLimit({windowMs:60_000,max:10,standardHeaders:true,legacyHeaders:false});
  function requireMissionAuth(req,res,next){
    if(typeof authenticate!=='function')return res.status(503).json({error:'Per-user mission authentication is not configured.'});
    try{
      const principal=authenticate(req);
      if(!principal||typeof principal.userId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(principal.userId))return res.status(401).json({error:'Unauthorized'});
      req.missionPrincipal=principal;
      next();
    }catch(_err){return res.status(503).json({error:'Mission authentication is unavailable.'});}
  }

  router.get('/status',requireMissionAuth,(_req,res)=>res.json({
    enabled:true,
    authentication:'per-user bearer tokens',
    isolation:'owner-scoped mission access',
    execution:'bounded AI text tasks only',
    storage:'filesystem',
    limits:{tasksPerMission:10,descriptionChars:1000,runRequestsPerMinute:10,maxAttempts:2},
    externalActions:false
  }));
  router.post('/',requireMissionAuth,limiter,async(req,res)=>{
    try{
      const {goal,tasks,constraints={}}=req.body||{};
      if(typeof goal!=='string'||!goal.trim()||goal.length>3000)return res.status(400).json({error:'Goal must be 1-3000 characters.'});
      if(!Array.isArray(tasks)||tasks.length<1||tasks.length>10)return res.status(400).json({error:'Provide 1-10 tasks.'});
      if(tasks.some(t=>!t||typeof t.description!=='string'||!t.description.trim()||t.description.length>1000))return res.status(400).json({error:'Each task description must be 1-1000 characters.'});
      if(!constraints||typeof constraints!=='object'||Array.isArray(constraints))return res.status(400).json({error:'Invalid constraints.'});
      const mission=createMission({goal,ownerRef:req.missionPrincipal.userId,constraints,tasks});
      await store.create(mission);
      res.status(201).json(publicMission(mission));
    }catch(_err){res.status(400).json({error:'Invalid mission request.'});}
  });
  router.get('/',requireMissionAuth,async(req,res)=>{
    try{const items=(await store.list()).filter(m=>m.ownerRef===req.missionPrincipal.userId).map(publicMission);res.json({items});}
    catch(_err){res.status(500).json({error:'Mission list unavailable.'});}
  });
  router.get('/:id',requireMissionAuth,async(req,res)=>{
    try{const m=await store.get(req.params.id);if(!m||m.ownerRef!==req.missionPrincipal.userId)return res.status(404).json({error:'Mission not found.'});res.json(publicMission(m));}
    catch(_err){res.status(400).json({error:'Invalid mission ID.'});}
  });
  router.post('/:id/run',requireMissionAuth,limiter,async(req,res)=>{
    try{
      const m=await store.get(req.params.id);
      if(!m||m.ownerRef!==req.missionPrincipal.userId)return res.status(404).json({error:'Mission not found.'});
      const result=await worker.runOne(m.id);
      if(result?.status==='busy')return res.status(409).json({error:'Mission is already being processed.'});
      const updated=await store.get(m.id);
      if(!updated||updated.ownerRef!==req.missionPrincipal.userId)return res.status(404).json({error:'Mission not found.'});
      res.json({worker:{status:result?.status||'accepted',taskId:result?.taskId},mission:publicMission(updated)});
    }catch(_err){res.status(500).json({error:'Mission execution failed.'});}
  });
  return router;
}
