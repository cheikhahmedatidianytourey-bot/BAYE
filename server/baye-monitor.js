'use strict';

/**
 * BAYE SENTINEL v1 — internal monitoring and diagnostic layer.
 * Endpoint checks and bounded in-memory incident history. No auto-remediation.
 */
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_HISTORY = 100;
const history = [];

async function checkEndpoint(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!url || typeof url !== 'string') return { ok:false,status:null,latencyMs:null,error:'Endpoint not configured' };
  const started=Date.now(), controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetch(url,{method:'GET',signal:controller.signal});
    return {ok:response.ok,status:response.status,latencyMs:Date.now()-started,error:response.ok?null:'Non-success HTTP response'};
  } catch(error) {
    return {ok:false,status:null,latencyMs:Date.now()-started,error:error?.name==='AbortError'?'Timeout':'Endpoint unreachable'};
  } finally { clearTimeout(timeout); }
}
async function runMonitor(){
  const endpoints=[
    {name:'backend-health',url:process.env.BAYE_BACKEND_HEALTH_URL||'https://baye-ai-gateway.onrender.com/health'},
    {name:'frontend',url:process.env.BAYE_FRONTEND_URL||'https://baye-app.onrender.com'}
  ];
  const results=await Promise.all(endpoints.map(async item=>({name:item.name,...await checkEndpoint(item.url)})));
  const report={checkedAt:new Date().toISOString(),overallOk:results.every(r=>r.ok),results,
    diagnostics:results.filter(r=>!r.ok).map(r=>({target:r.name,issue:r.error||'HTTP failure',recommendation:'Inspect service logs, recent deploys, and endpoint configuration.'}))};
  history.unshift(report);if(history.length>MAX_HISTORY)history.length=MAX_HISTORY;
  return report;
}
function getMonitorStatus(){
  const latest=history[0]||null;
  return {system:'BAYE SENTINEL',version:'1.0.0',mode:'endpoint monitoring and diagnostics',checksConfigured:2,
    checksRunInThisProcess:history.length,historyLimit:MAX_HISTORY,lastCheck:latest,
    status:latest?(latest.overallOk?'healthy':'attention_required'):'awaiting_first_check',
    capabilities:['endpoint health checks','latency measurement','basic diagnostics','bounded in-memory incident history'],
    limitations:['Monitoring runs when invoked; no continuous loop is enabled by this module.','History is in-memory and resets on restart.','No automatic remediation or external alert delivery.']};
}
function getMonitorHistory(limit=20){
  const n=Math.max(1,Math.min(50,Number.isInteger(limit)?limit:20));
  return history.slice(0,n);
}
export {checkEndpoint,runMonitor,getMonitorStatus,getMonitorHistory};
