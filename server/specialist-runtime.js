// Bounded specialist scheduler with preflight graph validation and optional durable state hooks.
import {transitionTaskState,createTaskState} from './orchestration-state.js';
const fail=(message)=>{throw new Error(message);};
function assertGraph(graph){
 if(!graph||typeof graph!=='object'||graph.mode!=='plan_only'||!Array.isArray(graph.tasks)||graph.tasks.length<1||graph.tasks.length>12)fail('Plan d’orchestration invalide.');
 const ids=new Set();
 for(const task of graph.tasks){
  if(!task||typeof task.id!=='string'||task.id.length<1||task.id.length>64||ids.has(task.id)||!Array.isArray(task.dependsOn)||!Array.isArray(task.capabilities))fail('Tâche de plan invalide.');
  if(task.dependsOn.length>12||task.capabilities.length>16||task.capabilities.some(c=>typeof c!=='string'||c.length>64))fail('Limites de tâche dépassées.');
  if(typeof task.objective!=='string'||task.objective.length<1||task.objective.length>2000)fail('Objectif de tâche invalide.');
  if(task.dependsOn.some(d=>typeof d!=='string')||new Set(task.dependsOn).size!==task.dependsOn.length)fail('Dépendances invalides ou dupliquées.');
  ids.add(task.id);
 }
 for(const task of graph.tasks)for(const dep of task.dependsOn)if(!ids.has(dep)||dep===task.id)fail('Dépendance de plan invalide.');
 const indegree=new Map(graph.tasks.map(t=>[t.id,t.dependsOn.length]));
 const downstream=new Map(graph.tasks.map(t=>[t.id,[]]));
 for(const t of graph.tasks)for(const d of t.dependsOn)downstream.get(d).push(t.id);
 const queue=graph.tasks.filter(t=>indegree.get(t.id)===0).map(t=>t.id);let visited=0;
 while(queue.length){const id=queue.shift();visited++;for(const next of downstream.get(id)){indegree.set(next,indegree.get(next)-1);if(indegree.get(next)===0)queue.push(next);}}
 if(visited!==graph.tasks.length)fail('Graphe de tâches cyclique.');
}
function boundedParallelism(value){if(!Number.isSafeInteger(value)||value<1||value>3)fail('Parallélisme invalide : maximum 3 workers.');return value;}
function safeOutput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Le worker doit retourner un objet résultat.');
 let serialized;try{serialized=JSON.stringify(value);}catch{fail('Résultat worker non sérialisable.');}
 if(typeof serialized!=='string'||serialized.length>50000)fail('Résultat worker trop volumineux.');
 return JSON.parse(serialized);
}
export async function runSpecialistTasks(graph,{execute,maxParallel=3,missionMemory=null,onTaskState=null,coordinationSession=null}={}){
 assertGraph(graph);boundedParallelism(maxParallel);if(typeof execute!=='function')fail('Exécuteur spécialiste requis.');
 if(onTaskState!==null&&typeof onTaskState!=='function')fail('Hook de checkpoint invalide.');
 if(coordinationSession!==null&&typeof coordinationSession.executeTask!=='function')fail('Hook de coordination invalide.');
 const notify=async(taskId,state,extra={})=>{if(onTaskState)await onTaskState({taskId,state,...extra});};
 const tasks=graph.tasks,states=new Map(tasks.map(t=>[t.id,createTaskState(t.id)])),outputs={},finished=new Set();
 let anyFailure=false;const taskResults=[];
 while(finished.size<tasks.length&&!anyFailure){
  const ready=tasks.filter(t=>!finished.has(t.id)&&states.get(t.id).status==='pending'&&t.dependsOn.every(id=>Object.hasOwn(outputs,id)));
  if(!ready.length)fail('Graphe bloqué après validation.');
  for(let i=0;i<ready.length;i+=maxParallel){
   const batch=ready.slice(i,i+maxParallel);
   const settled=await Promise.all(batch.map(async task=>{
    states.set(task.id,transitionTaskState(states.get(task.id),'ready'));
    await notify(task.id,states.get(task.id));
    states.set(task.id,transitionTaskState(states.get(task.id),'running'));
    await notify(task.id,states.get(task.id));
    const dependencies=Object.fromEntries(task.dependsOn.map(id=>[id,outputs[id]]));
    let output;
    try{const invocation={task:{...task,capabilities:[...task.capabilities]},dependencies,missionMemory};
    output=safeOutput(await (coordinationSession?coordinationSession.executeTask({...invocation,execute}):execute(invocation)));}
    catch(error){
     const reason=error instanceof Error?error.message:'worker_error';
     states.set(task.id,transitionTaskState(states.get(task.id),'failed',{reason:reason.slice(0,500)||'worker_error'}));anyFailure=true;
     await notify(task.id,states.get(task.id),{error:reason});
     return {taskId:task.id,status:'failed',error:'Specialist execution failed.',state:states.get(task.id)};
    }
    outputs[task.id]=output;states.set(task.id,transitionTaskState(states.get(task.id),'succeeded'));finished.add(task.id);
    await notify(task.id,states.get(task.id),{output});
    return {taskId:task.id,status:'succeeded',output,state:states.get(task.id)};
   }));
   taskResults.push(...settled);
   if(anyFailure){
    for(const task of tasks){const state=states.get(task.id);if(state.status==='pending'){const cancelled=transitionTaskState(state,'cancelled',{reason:'dependency_or_peer_failure'});states.set(task.id,cancelled);await notify(task.id,cancelled);}}
    return {status:'failed',results:taskResults,taskStates:Object.fromEntries(states),execution:{started:true,toolsInvoked:0,externalActions:false,failed:true}};
   }
  }
 }
 return {status:'succeeded',results:tasks.map(task=>({taskId:task.id,status:'succeeded',output:outputs[task.id],state:states.get(task.id)})),taskStates:Object.fromEntries(states),execution:{started:true,toolsInvoked:0,externalActions:false,failed:false}};
}
