import {buildExecutionGraph} from './orchestration-kernel.js';
import {runSpecialistTasks} from './specialist-runtime.js';
import {createSpecialistAIExecutor} from './ai/specialist-adapter.js';
import {reviewOrchestrationResults} from './orchestration-review.js';

const SERVICE_LIMITS=Object.freeze({maxTasks:5,maxDependenciesPerTask:4,maxTotalBudget:10,maxDepth:5});
export async function runBayeOrchestration({tasks,complete,maxParallel=2,maxTokens=1200}={}){
 const graph=buildExecutionGraph(tasks,SERVICE_LIMITS);
 const execute=createSpecialistAIExecutor({complete,maxTokens});
 const runtime=await runSpecialistTasks(graph,{execute,maxParallel});
 return {
  engine:'BAYE Specialist Orchestration',
  version:1,
  status:runtime.status,
  plan:{taskCount:graph.accounting.taskCount,totalBudget:graph.accounting.totalBudget,limits:graph.limits,tasks:graph.tasks.map(({id,role,objective,dependsOn,sequence})=>({id,role,objective,dependsOn,sequence}))},
  results:runtime.results,
  taskStates:runtime.taskStates,
  review:reviewOrchestrationResults({results:runtime.results,taskStates:runtime.taskStates}),
  execution:{started:runtime.execution.started,toolsInvoked:runtime.execution.toolsInvoked,externalActions:runtime.execution.externalActions,failed:runtime.execution.failed,parallelism:maxParallel},
  safety:{mode:'text_only_specialist_inference',toolsEnabled:false,externalActionsEnabled:false,independentFactVerification:false}
 };
}
