// G77: bounded parallel worker orchestration foundation.
// Executes only caller-injected worker functions. No shell, network, or repository access is built in.
const MAX_TASKS=100, MAX_CONCURRENCY=4, MAX_TITLE=240;
export function validateWorkerBatch(tasks){
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>MAX_TASKS)return {status:'rejected',error:'Batch must contain 1–100 tasks.'};
 const ids=new Set();
 for(const [i,t] of tasks.entries()){
  if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!t.id.trim()||typeof t.title!=='string'||!t.title.trim()||t.title.length>MAX_TITLE)return {status:'rejected',error:'Task '+i+' is invalid.'};
  if(ids.has(t.id))return {status:'rejected',error:'Duplicate task id.'};ids.add(t.id);
 }
 return {status:'validated',tasks};
}
export async function runParallelWorkerBatch(input,executor){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Input object required.'};
 const valid=validateWorkerBatch(input.tasks);if(valid.status!=='validated')return valid;
 if(typeof executor!=='function')return {status:'rejected',error:'An explicit worker executor function is required.'};
 const concurrency=input.concurrency===undefined?2:input.concurrency;
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MAX_CONCURRENCY)return {status:'rejected',error:'Concurrency must be an integer from 1 to 4.'};
 const tasks=valid.tasks,results=new Array(tasks.length);let next=0;
 async function worker(){while(true){const index=next++;if(index>=tasks.length)return;const task=tasks[index];try{const value=await executor(task);results[index]={id:task.id,status:'completed',result:value===undefined?null:value};}catch(error){results[index]={id:task.id,status:'failed',error:String(error?.message||error).slice(0,500)};}}}
 await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)},()=>worker()));
 return {status:results.every(r=>r.status==='completed')?'completed':'completed_with_failures',taskCount:tasks.length,concurrency,results};
}
export function getParallelWorkerEngineStatus(){return {name:'BAYE Parallel Worker Engine',milestone:'G77',version:'0.1.0',mode:'injected executor only',limits:{maxTasks:MAX_TASKS,maxConcurrency:MAX_CONCURRENCY},builtInShellExecution:false,networkAccess:false,repositoryAccess:false};}
