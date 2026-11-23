import {validateMissionCheckpoint} from './mission-checkpoint.js';

const ID=/^[-a-zA-Z0-9_]{1,64}$/;
const MAX_TASKS=12;
const MAX_DEPENDENCIES=6;
const fail=(message)=>{throw new Error(message);};

function validateGraph(graph){
 if(!graph||typeof graph!=='object'||!Array.isArray(graph.tasks)||graph.tasks.length<1||graph.tasks.length>MAX_TASKS)fail('Graphe de reprise invalide.');
 const byId=new Map();
 for(const task of graph.tasks){
  if(!task||typeof task!=='object'||!ID.test(task.id)||byId.has(task.id))fail('Identifiant de tâche de reprise invalide ou dupliqué.');
  if(!Array.isArray(task.dependsOn)||task.dependsOn.length>MAX_DEPENDENCIES||task.dependsOn.some(id=>typeof id!=='string'||!ID.test(id))||new Set(task.dependsOn).size!==task.dependsOn.length||task.dependsOn.includes(task.id))fail('Dépendances de reprise invalides.');
  byId.set(task.id,task);
 }
 for(const task of byId.values())for(const dependency of task.dependsOn)if(!byId.has(dependency))fail('Dépendance inconnue dans le graphe de reprise.');
 const indegree=new Map([...byId].map(([id,task])=>[id,task.dependsOn.length]));
 const downstream=new Map([...byId.keys()].map(id=>[id,[]]));
 for(const task of byId.values())for(const dependency of task.dependsOn)downstream.get(dependency).push(task.id);
 const queue=[...byId.keys()].filter(id=>indegree.get(id)===0);let visited=0;
 while(queue.length){const id=queue.shift();visited++;for(const child of downstream.get(id)){indegree.set(child,indegree.get(child)-1);if(indegree.get(child)===0)queue.push(child);}}
 if(visited!==byId.size)fail('Cycle détecté dans le graphe de reprise.');
 return byId;
}

/**
 * Builds a conservative, side-effect-free recovery plan.
 * It never invokes workers, retries tasks, or writes checkpoints.
 */
export function planMissionRecovery({checkpoint,graph,missionId,graphDigest}={}){
 const validated=validateMissionCheckpoint(checkpoint,{missionId,graphDigest});
 const tasks=validateGraph(graph);
 for(const taskId of Object.keys(validated.tasks))if(!tasks.has(taskId))fail('Le checkpoint contient une tâche absente du graphe.');
 const decisions={};
 const completed=new Set();
 const uncertain=new Set();
 const blocked=new Set();

 for(const [taskId,saved] of Object.entries(validated.tasks)){
  if(saved.status==='succeeded'){
   if(saved.output===undefined&&!(typeof saved.outputDigest==='string'&&saved.outputDigest.length>=8)){
    decisions[taskId]={status:'needs_review',reason:'successful_output_not_checkpointed'};
    uncertain.add(taskId);
   }else{
    decisions[taskId]={status:'completed',reason:'validated_checkpoint_success'};
    completed.add(taskId);
   }
  }else if(saved.status==='running'){
   decisions[taskId]={status:'needs_review',reason:'previous_process_execution_outcome_unknown'};
   uncertain.add(taskId);
  }else if(saved.status==='failed'||saved.status==='cancelled'||saved.status==='needs_review'){
   decisions[taskId]={status:'needs_review',reason:'retry_safety_not_proven'};
   uncertain.add(taskId);
  }
 }

 for(const [taskId,task] of tasks){
  if(decisions[taskId])continue;
  const unresolved=task.dependsOn.filter(id=>!completed.has(id));
  if(unresolved.length){
   decisions[taskId]={status:'blocked',reason:unresolved.some(id=>uncertain.has(id))?'dependency_requires_review':'dependency_not_completed',blockedBy:unresolved};
   blocked.add(taskId);
  }else{
   decisions[taskId]={status:'ready',reason:'all_dependencies_have_checkpointed_outputs'};
  }
 }

 const ready=Object.keys(decisions).filter(id=>decisions[id].status==='ready');
 const review=Object.keys(decisions).filter(id=>decisions[id].status==='needs_review');
 const blockedTasks=Object.keys(decisions).filter(id=>decisions[id].status==='blocked');
 const completedTasks=Object.keys(decisions).filter(id=>decisions[id].status==='completed');
 const allCompleted=completedTasks.length===tasks.size;
 return {
  engine:'BAYE Mission Recovery Planner',
  version:1,
  missionId:validated.missionId,
  graphDigest:validated.graphDigest,
  checkpointRevision:validated.revision,
  status:allCompleted?'completed':review.length?'needs_review':ready.length?'ready':'blocked',
  decisions,
  summary:{total:tasks.size,completed:completedTasks.length,ready:ready.length,needsReview:review.length,blocked:blockedTasks.length},
  execution:{started:false,workersInvoked:0,retriesScheduled:0,externalActions:false,checkpointWritten:false},
  safety:{automaticRetry:false,uncertainAttemptsReplayed:false,requiresHumanOrPolicyReconciliation:review.length>0}
 };
}
