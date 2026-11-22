// Bounded specialist worker scheduler. Execution is injected by the caller.
import {transitionTaskState,createTaskState} from './orchestration-state.js';

function fail(message){throw new Error(message);}
function assertGraph(graph){
 if(!graph||typeof graph!=='object'||graph.mode!=='plan_only'||!Array.isArray(graph.tasks)||graph.tasks.length<1||graph.tasks.length>12)fail('Plan d’orchestration invalide.');
 const ids=new Set();
 for(const task of graph.tasks){
  if(!task||typeof task.id!=='string'||ids.has(task.id)||!Array.isArray(task.dependsOn))fail('Tâche de plan invalide.');
  ids.add(task.id);
 }
 for(const task of graph.tasks)for(const dep of task.dependsOn)if(!ids.has(dep)||dep===task.id)fail('Dépendance de plan invalide.');
}
function boundedParallelism(value){
 if(!Number.isSafeInteger(value)||value<1||value>3)fail('Parallélisme invalide : maximum 3 workers.');
 return value;
}
function safeOutput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Le worker doit retourner un objet résultat.');
 let serialized;
 try{serialized=JSON.stringify(value);}catch{fail('Résultat worker non sérialisable.');}
 if(typeof serialized!=='string'||serialized.length>50000)fail('Résultat worker trop volumineux.');
 return JSON.parse(serialized);
}
export async function runSpecialistTasks(graph,{execute,maxParallel=3,missionMemory=null}={}){
 assertGraph(graph);
 boundedParallelism(maxParallel);
 if(typeof execute!=='function')fail('Exécuteur spécialiste requis.');
 const tasks=graph.tasks;
 const byId=new Map(tasks.map(task=>[task.id,task]));
 const states=new Map(tasks.map(task=>[task.id,createTaskState(task.id)]));
 const results={};
 const completed=[];
 let failed=false;
 while(completed.length<tasks.length&&!failed){
  const ready=tasks.filter(task=>!completed.includes(task.id)&&states.get(task.id).status==='pending'&&task.dependsOn.every(id=>Object.hasOwn(results,id)));
  if(ready.length===0)fail('Le graphe ne peut pas progresser : dépendance circulaire ou bloquée.');
  for(let i=0;i<ready.length;i+=maxParallel){
   const batch=ready.slice(i,i+maxParallel);
   const executions=batch.map(async task=>{
    states.set(task.id,transitionTaskState(states.get(task.id),'ready'));
    states.set(task.id,transitionTaskState(states.get(task.id),'running'));
    const dependencies=Object.fromEntries(task.dependsOn.map(id=>[id,results[id]]));
    try{
     const output=safeOutput(await execute({task:{...task,capabilities:[...task.capabilities]},dependencies,missionMemory}));
     results[task.id]=output;
     states.set(task.id,transitionTaskState(states.get(task.id),'succeeded'));
     completed.push(task.id);
     return {taskId:task.id,status:'succeeded',output,state:states.get(task.id)};
    }catch(error){
     const reason=error instanceof Error?error.message:'worker_error';
     states.set(task.id,transitionTaskState(states.get(task.id),'failed',{reason:reason.slice(0,500)||'worker_error'}));
     failed=true;
     return {taskId:task.id,status:'failed',error:'Specialist execution failed.',state:states.get(task.id)};
    }
   });
   const settled=await Promise.all(executions);
   if(failed){
    for(const task of tasks){
     const state=states.get(task.id);
     if(state.status==='pending')states.set(task.id,transitionTaskState(state,'cancelled',{reason:'dependency_or_peer_failure'}));
    }
    return {status:'failed',results:settled,taskStates:Object.fromEntries(states),execution:{started:true,toolsInvoked:0,externalActions:false,failed:true}};
   }
   // All tasks in this batch completed; later batches may consume their outputs.
  }
 }
 return {status:'succeeded',results:tasks.map(task=>({taskId:task.id,status:'succeeded',output:results[task.id],state:states.get(task.id)})),taskStates:Object.fromEntries(states),execution:{started:true,toolsInvoked:0,externalActions:false,failed:false}};
}
