// BAYE Core Orchestrator foundation. Injected planner/executor/policy; no implicit tools or providers.
import {validatePlan,topologicalOrder} from './plan.js';
const abortIfRequested = signal => { if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted.'); };
export class CoreOrchestrator {
 constructor({planner,executor,policy,maxTasks=200}={}) {
  if(typeof planner!=='function'||typeof executor!=='function')throw new TypeError('Planner and executor must be explicitly injected.');
  if(typeof policy!=='function')throw new TypeError('A policy gate must be explicitly injected.');
  if(!Number.isSafeInteger(maxTasks)||maxTasks<1||maxTasks>1000)throw new TypeError('maxTasks must be between 1 and 1000.');
  this.planner=planner;this.executor=executor;this.policy=policy;this.maxTasks=maxTasks;
 }
 async run({goal,context={},signal}={}) {
  if(typeof goal!=='string'||!goal.trim())throw new TypeError('A goal is required.');
  abortIfRequested(signal);
  const normalizedGoal=goal.trim();
  const plan=await this.planner({goal:normalizedGoal,context,signal});
  abortIfRequested(signal);
  validatePlan(plan,{maxTasks:this.maxTasks});
  const order=topologicalOrder(plan,{maxTasks:this.maxTasks});
  const authorization=await this.policy({goal:normalizedGoal,plan,context,signal});
  abortIfRequested(signal);
  if(authorization!==true&&authorization?.allowed!==true)throw new Error('Plan rejected by policy gate.');
  const results=Object.create(null),events=[];
  for(const task of order){
   abortIfRequested(signal);
   const dependencyResults=Object.create(null);
   for(const dep of task.dependencies)dependencyResults[dep]=results[dep];
   const result=await this.executor({task:structuredClone(task),goal:normalizedGoal,context,dependencyResults,signal});
   abortIfRequested(signal);
   results[task.id]=result;events.push({taskId:task.id,status:'completed'});
  }
  return {status:'completed',goal:normalizedGoal,plan:structuredClone(plan),results,events};
 }
}
