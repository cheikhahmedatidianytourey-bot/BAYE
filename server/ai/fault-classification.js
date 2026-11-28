// G70: deterministic fault classification and bounded comparison of diagnostics.
const SEVERITY={critical:3,major:2,minor:1,healthy:0};
export function classifyProbe(probe){
 if(!probe||typeof probe!=='object')return {category:'invalid-record',severity:'major',detail:'Probe record invalid'};
 if(probe.ok===true)return {category:'healthy',severity:'healthy',detail:'Probe succeeded'};
 if(probe.error==='timeout')return {category:'timeout',severity:'major',detail:'Probe exceeded its time limit'};
 if(probe.error==='connection-failed'||probe.status===null||probe.status===undefined)return {category:'network',severity:'critical',detail:'Connection could not be established'};
 if(probe.error==='http-status'||(Number.isInteger(probe.status)&&probe.status>=500))return {category:'server-error',severity:'major',detail:'Service returned server error'};
 if(Number.isInteger(probe.status)&&probe.status>=400)return {category:'client-or-route-error',severity:'minor',detail:'Probe returned non-success HTTP status'};
 return {category:'unexpected',severity:'minor',detail:'Probe outcome unexpected'};
}
export function analyzeDiagnosticReport(report){
 if(!report||!Array.isArray(report.results))return {status:'rejected',errors:['results array required']};
 const results=report.results.slice(0,100).map(p=>({...p,classification:classifyProbe(p)}));
 const counts={critical:0,major:0,minor:0,healthy:0};
 for(const r of results){const k=r.classification.severity;if(k in counts)counts[k]++;}
 return {status:'analyzed',summary:{total:results.length,healthy:counts.healthy,critical:counts.critical,major:counts.major,minor:counts.minor},results,generatedAt:new Date().toISOString()};
}
export function compareDiagnosticReports(previous,current){
 if(!previous||!current||!Array.isArray(previous.results)||!Array.isArray(current.results))return {status:'rejected',errors:['two reports with results required']};
 const oldMap=new Map(previous.results.slice(0,100).map(p=>[p.path,classifyProbe(p).category]));
 const items=current.results.slice(0,100).map(p=>{const category=classifyProbe(p).category,prior=oldMap.get(p.path)||'not-observed';return {path:p.path,previous:prior,current:category,changed:prior!==category,regressed:prior==='healthy'&&category!=='healthy',recovered:prior!=='healthy'&&category==='healthy'};});
 return {status:'compared',total:items.length,regressions:items.filter(x=>x.regressed).length,recoveries:items.filter(x=>x.recovered).length,changes:items.filter(x=>x.changed),items};
}
