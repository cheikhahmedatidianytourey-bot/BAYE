// G71: bounded in-process incident tracker fed by diagnostic analyses.
const LIMIT=500, incidents=new Map();
function fingerprint(path,category){return path+'::'+category;}
export function ingestFaultAnalysis(analysis){
 if(!analysis||analysis.status!=='analyzed'||!Array.isArray(analysis.results))return {status:'rejected',errors:['validated analysis required']};
 const created=[],updated=[];
 for(const probe of analysis.results.slice(0,100)){
  const c=probe.classification;if(!c||c.severity==='healthy')continue;
  const key=fingerprint(probe.path,c.category),now=new Date().toISOString(),existing=incidents.get(key);
  if(existing){existing.lastSeen=now;existing.occurrences++;existing.severity=c.severity;updated.push(existing.id);}
  else{
   if(incidents.size>=LIMIT)return {status:'capacity',limit:LIMIT,created,updated};
   const record={id:key,path:probe.path,category:c.category,severity:c.severity,detail:c.detail,status:'open',firstSeen:now,lastSeen:now,occurrences:1};
   incidents.set(key,record);created.push(record.id);
  }
 }
 return {status:'recorded',created,updated};
}
export function listFaultIncidents({status='',severity='',limit=100}={}){
 const n=Math.min(200,Math.max(1,Number.isInteger(limit)?limit:100));
 return {items:[...incidents.values()].filter(x=>(!status||x.status===status)&&(!severity||x.severity===severity)).sort((a,b)=>b.lastSeen.localeCompare(a.lastSeen)).slice(0,n),limit:n,storage:'in-memory',persistent:false};
}
export function resolveFaultIncident(id,reason='manual resolution'){
 const record=incidents.get(id);if(!record)return {status:'not-found'};
 if(typeof reason!=='string'||reason.length>300)return {status:'rejected',errors:['reason must be at most 300 characters']};
 record.status='resolved';record.resolvedAt=new Date().toISOString();record.resolutionReason=reason;return {status:'resolved',incident:record};
}
export function restoreFaultIncidents(records=[]){
 if(!Array.isArray(records))return {status:'rejected',restored:0};
 let restored=0;for(const r of records.slice(0,LIMIT)){if(!r||typeof r.id!=='string'||typeof r.path!=='string'||typeof r.category!=='string'||typeof r.severity!=='string'||typeof r.status!=='string')continue;const current=incidents.get(r.id);if(!current||String(r.lastSeen||'')>String(current.lastSeen||'')){incidents.set(r.id,{...r});restored++;}}return {status:'restored',restored,count:incidents.size};
}
export function getIncidentTrackingStatus(){return {module:'G71 incident tracker',storage:'in-memory',persistent:false,capacity:LIMIT,count:incidents.size};}
