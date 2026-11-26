// BAYE Core Orchestrator foundation. Injected planner/executor/policy; no implicit tools or providers.
import {validatePlan,topologicalOrder} from './plan.js';
export class CoreOrchestrator {
 constructor({planner,executor,policy,maxTasks=200}={}) {
  if(typeof planner!=='function'||typeof executor!=='function')throw new TypeError('Planner and executor must be explicitly injected.');
  if(typeof policy!=='function')throw new TypeError('A policy gate must be explicitly injected.');
  if(!Number.isSafeInteger(maxTasks)||maxTasks<1||maxTasks>1000)throw new TypeError('maxTasks must be between 1 and 1000.');
  this.planner=planner;this.executor=executor;this.policy=policy;this.maxTasks=maxTasks;
 }
 async run({goal,context={},signal}={}) {
  if(typeof goal!=='string'||!goal.trim())throw new TypeError('A goal is required.');
  if(signal?.aborted)throw signal.reason??new Error('Operation aborted.');
  const plan=await this.planner({goal:goal.trim(),context,signal});
  validatePlan(plan,{maxTasks:this.maxTasks});
  const order=topologicalOrder(plan);
  const authorization=await this.policy({goal,plan,context});
  if(authorization!==true&&authorization?.allowed!==true)throw new Error('Plan rejected by policy gate.');
  const results={},events=[];
  for(const task of order){
   if(signal?.aborted)throw signal.reason??new Error('Operation aborted.');
   const dependencyResults={};for(const dep of task.dependencies)dependencyResults[dep]=results[dep];
   const result=await this.executor({task:structuredClone(task),goal,context,dependencyResults,signal});
   results[task.id]=result;events.push({taskId:task.id,status:'completed'});
  }
  return {status:'completed',goal,plan:structuredClone(plan),results,events};
 }
}
