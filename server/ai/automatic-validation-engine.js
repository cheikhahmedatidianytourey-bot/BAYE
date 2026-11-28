// G78: bounded validation-suite orchestration.
// Runs only explicitly injected check functions; no shell, network, or repository access.
const MAX_CHECKS=50,MAX_CONCURRENCY=4,MAX_LABEL=160,MAX_SUMMARY=500;
export function validateValidationSuite(checks){
 if(!Array.isArray(checks)||checks.length<1||checks.length>MAX_CHECKS)return {status:'rejected',error:'Suite must contain 1–50 checks.'};
 const ids=new Set();
 for(const [i,c] of checks.entries()){
  if(!c||typeof c!=='object'||Array.isArray(c)||typeof c.id!=='string'||!c.id.trim()||typeof c.label!=='string'||!c.label.trim()||c.label.length>MAX_LABEL)return {status:'rejected',error:'Check '+i+' is invalid.'};
  if(ids.has(c.id))return {status:'rejected',error:'Duplicate check id.'};ids.add(c.id);
  if(c.required!==undefined&&typeof c.required!=='boolean')return {status:'rejected',error:'Check required flag must be boolean.'};
 }
 return {status:'validated',checks};
}
export async function runValidationSuite(input,runner){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Input object required.'};
 const valid=validateValidationSuite(input.checks);if(valid.status!=='validated')return valid;
 if(typeof runner!=='function')return {status:'rejected',error:'An explicit validation runner function is required.'};
 const concurrency=input.concurrency===undefined?2:input.concurrency;
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MAX_CONCURRENCY)return {status:'rejected',error:'Concurrency must be an integer from 1 to 4.'};
 const checks=valid.checks,results=new Array(checks.length);let next=0;
 async function worker(){while(true){const index=next++;if(index>=checks.length)return;const check=checks[index];try{
  const raw=await runner(check);
  if(!raw||typeof raw!=='object'||typeof raw.passed!=='boolean')throw new Error('Runner must return an object with a boolean passed field.');
  results[index]={id:check.id,status:raw.passed?'passed':'failed',required:check.required!==false,summary:typeof raw.summary==='string'?raw.summary.slice(0,MAX_SUMMARY):''};
 }catch(error){results[index]={id:check.id,status:'error',required:check.required!==false,summary:String(error?.message||error).slice(0,MAX_SUMMARY)};}}}
 await Promise.all(Array.from({length:Math.min(concurrency,checks.length)},()=>worker()));
 const required=results.filter(r=>r.required),passed=required.every(r=>r.status==='passed');
 return {status:passed?'passed':'failed',checkCount:checks.length,requiredCount:required.length,passedCount:results.filter(r=>r.status==='passed').length,failedCount:results.filter(r=>r.status!=='passed').length,results};
}
export function getValidationEngineStatus(){return {name:'BAYE Automatic Test & Validation Engine',milestone:'G78',version:'0.1.0',mode:'injected checks only',limits:{maxChecks:MAX_CHECKS,maxConcurrency:MAX_CONCURRENCY},builtInShellExecution:false,networkAccess:false,repositoryAccess:false};}
