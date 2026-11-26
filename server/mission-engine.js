// BAYE V6 Mission Engine — Phase A: mission record schema and state machine (no persistence yet).
import {randomUUID} from 'node:crypto';

export const MISSION_SCHEMA_VERSION = 1;
export const MISSION_STATES = Object.freeze(['queued','running','waiting','paused','completed','failed','cancelled']);
export const TASK_STATES = Object.freeze(['pending','running','waiting','completed','failed','cancelled']);
const transitions = Object.freeze({
 queued:['running','paused','cancelled'],
 running:['waiting','paused','completed','failed','cancelled'],
 waiting:['running','paused','failed','cancelled'],
 paused:['queued','running','cancelled'],
 failed:['queued'],
 completed:[],
 cancelled:[]
});
const taskTransitions = Object.freeze({
 pending:['running','cancelled'],
 running:['waiting','completed','failed','cancelled'],
 waiting:['running','failed','cancelled'],
 completed:[],failed:['pending'],cancelled:[]
});
const validIso = value => typeof value==='string' && Number.isFinite(Date.parse(value));
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);

export function createMission({goal,ownerRef=null,constraints={},tasks=[]}={}){
 if(typeof goal!=='string'||!goal.trim())throw new TypeError('Mission goal is required.');
 if(!Array.isArray(tasks))throw new TypeError('Mission tasks must be an array.');
 if(!object(constraints))throw new TypeError('Mission constraints must be an object.');
 if(ownerRef!==null&&typeof ownerRef!=='string')throw new TypeError('Mission ownerRef must be a string or null.');
 const now=new Date().toISOString();
 const mission={
  id:randomUUID(),schemaVersion:MISSION_SCHEMA_VERSION,ownerRef,
  goal:goal.trim(),constraints,status:'queued',
  createdAt:now,updatedAt:now,lastHeartbeatAt:null,
  tasks:tasks.map((task,index)=>createTask(task,index)),
  checkpoint:{completedTaskIds:[],lastTaskId:null},
  retry:{attempt:0,lastError:null,nextRetryAt:null},
  approvals:[],audit:[{event:'mission_created',at:now}]
 };
 validateMission(mission);
 return mission;
}
export function createTask(task={},index=0){
 if(!object(task))throw new TypeError('Task must be an object.');
 const id=typeof task.id==='string'&&task.id.trim()?task.id.trim():randomUUID();
 const description=typeof task.description==='string'?task.description.trim():'';
 if(!description)throw new TypeError('Task description is required.');
 return {id,order:Number.isSafeInteger(task.order)&&task.order>=0?task.order:index,description,status:'pending',dependencies:Array.isArray(task.dependencies)?[...task.dependencies]:[],attempt:0,resultRef:null,error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function validateMission(mission){
 if(!object(mission))throw new TypeError('Mission record must be an object.');
 if(mission.schemaVersion!==MISSION_SCHEMA_VERSION)throw new Error('Unsupported mission schema version.');
 if(typeof mission.id!=='string'||!mission.id.trim())throw new Error('Mission ID is required.');
 if(typeof mission.goal!=='string'||!mission.goal.trim())throw new Error('Mission goal is required.');
 if(!MISSION_STATES.includes(mission.status))throw new Error('Invalid mission status.');
 if(!validIso(mission.createdAt)||!validIso(mission.updatedAt))throw new Error('Invalid mission timestamps.');
 if(mission.lastHeartbeatAt!==null&&!validIso(mission.lastHeartbeatAt))throw new Error('Invalid heartbeat timestamp.');
 if(!object(mission.constraints)||!Array.isArray(mission.tasks)||!object(mission.checkpoint)||!Array.isArray(mission.checkpoint.completedTaskIds))throw new Error('Invalid constraints, tasks or checkpoint.');
 if(JSON.stringify(mission.constraints).length>65536)throw new Error('Mission constraints exceed size limit.');
 if(mission.audit?.length>10000||mission.approvals?.length>1000)throw new Error('Mission audit or approvals exceed size limit.');
 if(mission.ownerRef!==null&&typeof mission.ownerRef!=='string')throw new Error('Invalid mission ownerRef.');
 const ids=new Set();
 for(const task of mission.tasks){
  if(!object(task)||typeof task.id!=='string'||!task.id||ids.has(task.id))throw new Error('Invalid or duplicate task ID.');
  ids.add(task.id);
  if(!TASK_STATES.includes(task.status)||typeof task.description!=='string'||!task.description.trim())throw new Error('Invalid task record.');
  if(!Array.isArray(task.dependencies)||task.dependencies.some(id=>typeof id!=='string')||new Set(task.dependencies).size!==task.dependencies.length)throw new Error('Invalid task dependencies.');
  if(!validIso(task.createdAt)||!validIso(task.updatedAt))throw new Error('Invalid task timestamps.');
  if(task.error!==null&&typeof task.error!=='string')throw new Error('Invalid task error.');
  if(task.dependencies.includes(task.id))throw new Error('Task cannot depend on itself.');
  if(!Number.isSafeInteger(task.order)||task.order<0||!Number.isSafeInteger(task.attempt)||task.attempt<0)throw new Error('Invalid task order or attempt counter.');
 }
 for(const task of mission.tasks)for(const dep of task.dependencies)if(!ids.has(dep))throw new Error('Task dependency references an unknown task.');
 // Reject dependency cycles iteratively (Kahn's algorithm), avoiding stack overflow on deep graphs.
 const dependents=new Map([...ids].map(id=>[id,[]]));
 const indegree=new Map([...ids].map(id=>[id,0]));
 for(const task of mission.tasks){indegree.set(task.id,task.dependencies.length);for(const dep of task.dependencies)dependents.get(dep).push(task.id);}
 const ready=[...ids].filter(id=>indegree.get(id)===0);let visitedCount=0;
 while(ready.length){const id=ready.pop();visitedCount++;for(const child of dependents.get(id)){const next=indegree.get(child)-1;indegree.set(child,next);if(next===0)ready.push(child);}}
 if(visitedCount!==ids.size)throw new Error('Task dependencies contain a cycle.');
 const completed=mission.tasks.filter(task=>task.status==='completed').map(task=>task.id);
 if(new Set(mission.checkpoint.completedTaskIds).size!==mission.checkpoint.completedTaskIds.length||mission.checkpoint.completedTaskIds.some(id=>!ids.has(id))||completed.length!==mission.checkpoint.completedTaskIds.length||completed.some(id=>!mission.checkpoint.completedTaskIds.includes(id)))throw new Error('Checkpoint completed-task list is inconsistent.');
 if(mission.checkpoint.lastTaskId!==null&&!ids.has(mission.checkpoint.lastTaskId))throw new Error('Checkpoint references an unknown task.');
 if(!object(mission.retry)||!Number.isSafeInteger(mission.retry.attempt)||mission.retry.attempt<0|| (mission.retry.lastError!==null&&typeof mission.retry.lastError!=='string') || (mission.retry.nextRetryAt!==null&&!validIso(mission.retry.nextRetryAt)))throw new Error('Invalid retry record.');
 if(!Array.isArray(mission.audit)||mission.audit.some(entry=>!object(entry)||typeof entry.event!=='string'||!validIso(entry.at))||!Array.isArray(mission.approvals)||mission.approvals.some(entry=>!object(entry)))throw new Error('Invalid audit or approvals.');
 return {valid:true,taskCount:mission.tasks.length};
}
export function transitionMission(mission,nextState,{event=null,now=new Date().toISOString()}={}){
 validateMission(mission);
 if(!MISSION_STATES.includes(nextState))throw new Error('Unknown mission state.');
 if(!transitions[mission.status].includes(nextState))throw new Error('Invalid mission state transition: '+mission.status+' -> '+nextState);
 const updated={...mission,status:nextState,updatedAt:now,audit:[...mission.audit,{event:event||'mission_'+nextState,at:now,from:mission.status,to:nextState}]};
 validateMission(updated);
 return updated;
}
export function transitionTask(mission,taskId,nextState,{now=new Date().toISOString(),resultRef=null,error=null}={}){
 validateMission(mission);
 const index=mission.tasks.findIndex(task=>task.id===taskId);
 if(index<0)throw new Error('Task not found.');
 const task=mission.tasks[index];
 if(!TASK_STATES.includes(nextState)||!taskTransitions[task.status].includes(nextState))throw new Error('Invalid task state transition: '+task.status+' -> '+nextState);
 const updatedTask={...task,status:nextState,updatedAt:now,attempt:task.attempt+(nextState==='running'?1:0),resultRef,error};
 const tasks=mission.tasks.map((t,i)=>i===index?updatedTask:t);
 const completedTaskIds=nextState==='completed'?[...new Set([...mission.checkpoint.completedTaskIds,taskId])]:mission.checkpoint.completedTaskIds.filter(id=>id!==taskId);
 const updated={...mission,tasks,checkpoint:{...mission.checkpoint,completedTaskIds,lastTaskId:taskId},updatedAt:now,audit:[...mission.audit,{event:'task_'+nextState,taskId,at:now}]};
 validateMission(updated);
 return updated;
}
export function getMissionEnginePhaseAStatus(){
 return {name:'BAYE Mission Engine',phase:'A',schemaVersion:MISSION_SCHEMA_VERSION,persistence:'not implemented in Phase A',missionWideDurationLimit:false,taskCountLimit:false,stateMachine:true,checkpointSchema:true};
}
