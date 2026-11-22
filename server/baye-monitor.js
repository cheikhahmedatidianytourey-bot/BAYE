'use strict';

import {SentinelHistoryStore} from './sentinel-history-store.js';

/**
 * BAYE SENTINEL v2 — periodic endpoint checks, diagnostics and transition logging.
 * History is restored from a configurable JSON file; survival across host restarts
 * requires that file to reside on genuinely persistent storage.
 */
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_HISTORY = 100;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const history = [];
const historyStore = new SentinelHistoryStore({maxEntries:MAX_HISTORY});
let historyRestorePromise = null;
let intervalHandle = null;
let lastOverallOk = null;

async function restoreHistory() {
  if (!historyRestorePromise) {
    historyRestorePromise = historyStore.load().then(saved => {
      history.splice(0,history.length,...saved);
      if (history[0] && typeof history[0].overallOk === 'boolean') lastOverallOk=history[0].overallOk;
      return history.length;
    }).catch(error => {
      console.error('[BAYE SENTINEL] history restore failed:',error?.message||error);
      return 0;
    });
  }
  return historyRestorePromise;
}

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
  await restoreHistory();
  const endpoints=[
    {name:'backend-health',url:process.env.BAYE_BACKEND_HEALTH_URL||'https://baye-ai-gateway.onrender.com/health'},
    {name:'frontend',url:process.env.BAYE_FRONTEND_URL||'https://baye-app.onrender.com'}
  ];
  const results=await Promise.all(endpoints.map(async item=>({name:item.name,...await checkEndpoint(item.url)})));
  const report={checkedAt:new Date().toISOString(),overallOk:results.every(r=>r.ok),results,
    diagnostics:results.filter(r=>!r.ok).map(r=>({target:r.name,issue:r.error||'HTTP failure',recommendation:'Inspect service logs, recent deploys, and endpoint configuration.'}))};
  history.unshift(report);if(history.length>MAX_HISTORY)history.length=MAX_HISTORY;
  try { await historyStore.save(history); }
  catch(error) { console.error('[BAYE SENTINEL] history persistence failed:',error?.message||error); }
  console.log('[BAYE SENTINEL] cycle',JSON.stringify({checkedAt:report.checkedAt,overallOk:report.overallOk,results:report.results.map(r=>({name:r.name,ok:r.ok,status:r.status,latencyMs:r.latencyMs,error:r.error}))}));
  if(lastOverallOk!==report.overallOk){
    console.log('[BAYE SENTINEL] state transition:',lastOverallOk===null?'initial':lastOverallOk?'healthy -> attention':'attention -> healthy',JSON.stringify({checkedAt:report.checkedAt,overallOk:report.overallOk,diagnostics:report.diagnostics}));
    lastOverallOk=report.overallOk;
  } else if(!report.overallOk) console.warn('[BAYE SENTINEL] incident check',JSON.stringify(report.diagnostics));
  return report;
}
function startPeriodicMonitor(){
  if(intervalHandle)return {started:false,intervalMs:configuredInterval(),reason:'already_running'};
  if(process.env.BAYE_SENTINEL_AUTORUN==='false')return {started:false,reason:'disabled_by_environment'};
  const intervalMs=configuredInterval();
  intervalHandle=setInterval(()=>{runMonitor().catch(err=>console.error('[BAYE SENTINEL] check error',err?.message||err));},intervalMs);
  if(typeof intervalHandle.unref==='function')intervalHandle.unref();
  console.log('[BAYE SENTINEL] periodic checks enabled',intervalMs);
  restoreHistory().then(()=>runMonitor()).catch(err=>console.error('[BAYE SENTINEL] initial check error',err?.message||err));
  return {started:true,intervalMs};
}
function configuredInterval(){
  const raw=Number(process.env.BAYE_SENTINEL_INTERVAL_MS);
  return Number.isFinite(raw)&&raw>=60000?Math.min(raw,3600000):DEFAULT_INTERVAL_MS;
}
function getMonitorStatus(){
  const latest=history[0]||null;
  return {system:'BAYE SENTINEL',version:'2.0.0',mode:'periodic endpoint monitoring and diagnostics',checksConfigured:2,
    periodicMonitoring:!!intervalHandle,intervalMs:intervalHandle?configuredInterval():null,
    checksRunInThisProcess:history.length,historyLimit:MAX_HISTORY,lastCheck:latest,
    historyStorage:'JSON file',
    historyFile:historyStore.filePath,
    status:latest?(latest.overallOk?'healthy':'attention_required'):'awaiting_first_check',
    capabilities:['periodic endpoint health checks','latency measurement','incident diagnostics','state-transition logging','bounded file-backed history'],
    limitations:['Checks run only while this service process is running; hosting sleep/restarts interrupt them.','History survives process restarts only when BAYE_SENTINEL_HISTORY_FILE points to genuinely persistent storage (for example, a correctly mounted persistent disk).','No automatic remediation or external alert delivery.','History writes and periodic scheduling are process-local; multiple service instances require shared coordination/storage before being enabled safely.']};
}
function getMonitorHistory(limit=20){
  const n=Math.max(1,Math.min(50,Number.isInteger(limit)?limit:20));
  return history.slice(0,n);
}
export {checkEndpoint,runMonitor,startPeriodicMonitor,getMonitorStatus,getMonitorHistory,restoreHistory};
