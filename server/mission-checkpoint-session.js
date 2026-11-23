import {createHash} from 'node:crypto';
import {createMissionCheckpoint} from './mission-checkpoint.js';

const OWNER=/^[a-f0-9]{64}$/;
const MISSION=/^[-a-zA-Z0-9_]{1,64}$/;
const digestGraph=(graph)=>{const canonical={engine:graph.engine,version:graph.version,mode:graph.mode,limits:graph.limits,tasks:graph.tasks.map(({id,role,objective,dependsOn,budget,capabilities,sequence})=>({id,role,objective,dependsOn,budget,capabilities,sequence}))};return 'sha256:'+createHash('sha256').update(JSON.stringify(canonical)).digest('hex');};

export function createDurableMissionCheckpointSession({ledger,ownerId,missionId,graph}={}){
 if(!ledger||typeof ledger.save!=='function')throw new TypeError('Durable mission ledger is required.');
 if(typeof ownerId!=='string'||!OWNER.test(ownerId))throw new TypeError('Hashed owner namespace is required.');
 if(typeof missionId!=='string'||!MISSION.test(missionId))throw new TypeError('Mission identifier is invalid.');
 if(!graph||!Array.isArray(graph.tasks)||graph.tasks.length<1||graph.tasks.length>12)throw new TypeError('Validated mission graph is required.');
 const graphDigest=digestGraph(graph);
 const tasks=Object.fromEntries(graph.tasks.map(task=>[task.id,{status:'pending',attempt:0,history:[]}]));
 let revision=-1,queue=Promise.resolve(),status='running';
 const persist=async()=>{
  const nextRevision=revision+1;
  const checkpoint=createMissionCheckpoint({missionId,graphDigest,tasks,status,revision:nextRevision});
  const saved=await ledger.save({ownerId,checkpoint,expectedRevision:revision,graphDigest});
  revision=nextRevision;
  return saved;
 };
 const enqueue=(operation)=>{
  const next=queue.then(operation);
  queue=next.catch(()=>{});
  return next;
 };
 const ready=enqueue(()=>persist());
 return Object.freeze({
  missionId,graphDigest,
  async onTaskState({taskId,state,output,error}={}){
   return enqueue(async()=>{
    await ready;
    const prior=tasks[taskId];
    if(!prior)throw new Error('Unknown checkpoint task.');
    const nextStatus=state?.status;
    if(!['ready','running','succeeded','failed','cancelled','needs_review'].includes(nextStatus))throw new Error('Invalid checkpoint task transition.');
    const history=[...prior.history,{status:nextStatus,at:new Date().toISOString()}].slice(-20);
    tasks[taskId]={status:nextStatus,attempt:prior.attempt+(nextStatus==='running'?1:0),history,
      ...(nextStatus==='succeeded'&&output!==undefined?{output}:{}),
      ...(nextStatus==='failed'&&typeof error==='string'?{lastError:error.slice(0,500)}:{})};
    const saved=await persist();
    return {revision,sequence:saved.sequence};
   });
  },
  async finish(finalStatus){
   if(!['succeeded','failed','needs_review'].includes(finalStatus))throw new Error('Invalid mission checkpoint status.');
   return enqueue(async()=>{await ready;status=finalStatus;const saved=await persist();return {revision,sequence:saved.sequence,graphDigest};});
  },
  async initialized(){await ready;return {revision,graphDigest};}
 });
}
