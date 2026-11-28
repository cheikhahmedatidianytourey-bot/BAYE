// G63: controlled task queue metadata prototype. Never executes task payloads.
import crypto from 'node:crypto';
const queue=new Map(),MAX=200,ALLOWED=new Set(['dataset-validation','model-evaluation-plan','resource-inspection']);
function clone(v){return JSON.parse(JSON.stringify(v));}
export function enqueueControlledTask(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Task metadata object required.'};
 if(!ALLOWED.has(input.taskType))return {status:'rejected',error:'Task type is not allowlisted.'};
 if(typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>160)return {status:'rejected',error:'Bounded task reference required.'};
 if(queue.size>=MAX)return {status:'capacity',error:'Queue capacity reached.'};
 const id=crypto.randomUUID(),now=new Date().toISOString(),task={id,taskType:input.taskType,reference:input.reference.trim(),stage:'queued',createdAt:now,updatedAt:now,events:[{stage:'queued',at:now}],executionEnabled:false,payloadExecution:false};
 queue.set(id,task);return {status:'queued',task:clone(task),executionEnabled:false};
}
export function updateControlledTaskStage(input){
 if(!input||typeof input!=='object')return {status:'rejected',error:'Transition metadata required.'};
 const task=queue.get(input.id);if(!task)return {status:'not-found'};
 const stages=['queued','review-pending','blocked','cancelled'];
 if(!stages.includes(input.stage))return {status:'rejected',error:'Unsupported stage.'};
 if(['blocked','cancelled'].includes(task.stage)&&input.stage!=='blocked')return {status:'blocked',error:'Terminal task cannot be reopened.'};
 if(input.stage==='blocked'&&!(typeof input.note==='string'&&input.note.trim()))return {status:'rejected',error:'Reason required for blocking.'};
 const now=new Date().toISOString();task.stage=input.stage;task.updatedAt=now;task.events.push({stage:input.stage,at:now,note:typeof input.note==='string'?input.note.slice(0,200):''});
 return {status:'updated',task:clone(task),executionEnabled:false,payloadExecution:false};
}
export function getControlledTask(id){const t=queue.get(id);return t?clone(t):null;}
export function listControlledTasks(limit=50){const n=Math.max(1,Math.min(100,Number.isInteger(limit)?limit:50));return [...queue.values()].slice(-n).reverse().map(clone);}
export function getControlledTaskQueueStatus(){return {stage:'metadata-queue-prototype',storedTasks:queue.size,capacity:MAX,allowlistedTaskTypes:[...ALLOWED],executionEnabled:false,payloadExecution:false,workerDispatchEnabled:false,trainingStarted:false,scope:'queue metadata only; no task payload execution, worker dispatch or training'};}
