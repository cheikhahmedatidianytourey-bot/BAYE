// G69: bounded local API health diagnostic. Probes only fixed loopback endpoints.
const PATHS=['/health','/api/training-engine/status','/api/training-readiness/status','/api/verification/status','/api/owned-models/status','/api/data-engine/status','/api/compute-worker/status','/api/controlled-task-queue/status','/api/execution-gate/status','/api/release-readiness'];
const MAX_MS=2500;
export function summarizeApiProbe(path,status,durationMs,error=null){
 const valid=PATHS.includes(path),ok=valid&&Number.isInteger(status)&&status>=200&&status<300;
 return {path,ok,status:valid?(status??null):null,durationMs:Number.isFinite(durationMs)?Math.max(0,Math.round(durationMs)):null,error:valid?(error||null):'path-not-allowlisted'};
}
export function diagnosticPaths(){return [...PATHS];}
export async function runLocalApiDiagnostics({port=process.env.PORT||10000}={}){
 const results=[];
 for(const path of PATHS){
  const started=Date.now();
  try{
   const response=await fetch('http://127.0.0.1:'+Number(port)+path,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(MAX_MS)});
   results.push(summarizeApiProbe(path,response.status,Date.now()-started,response.ok?null:'http-status'));
  }catch(e){results.push(summarizeApiProbe(path,null,Date.now()-started,e?.name==='TimeoutError'?'timeout':'connection-failed'));}
 }
 const passed=results.filter(x=>x.ok).length;
 return {diagnostic:'BAYE local API diagnostics',scope:'fixed loopback GET probes only; no writes or external targets',checkedAt:new Date().toISOString(),total:results.length,passed,failed:results.length-passed,healthy:passed===results.length,results};
}
