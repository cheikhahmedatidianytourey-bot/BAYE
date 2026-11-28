// G79: deterministic, evidence-bounded failure diagnosis.
// Produces hypotheses, not authoritative root-cause claims. No remediation is executed.
const MAX_RECORDS=100,MAX_TEXT=1000,MAX_HYPOTHESES=8;
const RULES=[
 {code:'timeout',category:'timeout',severity:'major',cause:'Operation exceeded its time budget',action:'Inspect latency, workload size and configured timeout',confidence:0.9},
 {code:'connection-failed',category:'connectivity',severity:'critical',cause:'A required endpoint or service could not be reached',action:'Check endpoint availability, DNS and network path',confidence:0.92},
 {code:'dependency-unavailable',category:'dependency',severity:'major',cause:'A required dependency appears unavailable',action:'Inspect dependency health and service readiness',confidence:0.88},
 {code:'permission-denied',category:'authorization',severity:'major',cause:'The operation was rejected by an authorization boundary',action:'Verify the minimum required permission and credential scope',confidence:0.9},
 {code:'invalid-input',category:'input-validation',severity:'minor',cause:'Input did not satisfy the expected validation contract',action:'Compare the supplied input with the documented schema',confidence:0.9},
 {code:'assertion-failed',category:'test-regression',severity:'major',cause:'An expected condition did not match the observed result',action:'Inspect the failing assertion and the most recent relevant change',confidence:0.86},
 {code:'resource-exhausted',category:'capacity',severity:'major',cause:'A bounded resource or capacity limit was reached',action:'Inspect queue depth, memory, CPU and configured limits',confidence:0.86},
 {code:'http-5xx',category:'service-failure',severity:'major',cause:'A service returned a server-side failure',action:'Inspect service logs and correlated dependency health',confidence:0.82}
];
const clean=(v,n=MAX_TEXT)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):'';
export function validateFailureEvidence(records){
 if(!Array.isArray(records)||records.length<1||records.length>MAX_RECORDS)return {status:'rejected',error:'Evidence must contain 1–100 records.'};
 const ids=new Set();
 for(const [i,r] of records.entries()){
  if(!r||typeof r!=='object'||Array.isArray(r)||typeof r.id!=='string'||!r.id.trim()||r.id.length>120)return {status:'rejected',error:'Evidence record '+i+' has an invalid id.'};
  if(ids.has(r.id))return {status:'rejected',error:'Duplicate evidence id.'};ids.add(r.id);
  if(r.errorCode!==undefined&&typeof r.errorCode!=='string')return {status:'rejected',error:'errorCode must be a string.'};
  if(r.message!==undefined&&typeof r.message!=='string')return {status:'rejected',error:'message must be a string.'};
  if(r.attempts!==undefined&&(!Number.isInteger(r.attempts)||r.attempts<0||r.attempts>10000))return {status:'rejected',error:'attempts must be an integer from 0 to 10000.'};
 }
 return {status:'validated',count:records.length};
}
export function diagnoseFailures(records){
 const valid=validateFailureEvidence(records);if(valid.status!=='validated')return valid;
 const grouped=new Map();
 for(const record of records){
  const code=clean(record.errorCode,80).toLowerCase();
  const rule=RULES.find(r=>r.code===code);
  const key=rule?rule.code:'unknown';
  if(!grouped.has(key))grouped.set(key,{rule,count:0,evidenceIds:[],stages:new Set(),sources:new Set(),messages:[]});
  const group=grouped.get(key);group.count++;group.evidenceIds.push(record.id);
  const stage=clean(record.stage,80),source=clean(record.source,80),message=clean(record.message,240);
  if(stage)group.stages.add(stage);if(source)group.sources.add(source);if(message&&group.messages.length<3)group.messages.push(message);
 }
 const hypotheses=[...grouped.entries()].map(([code,g])=>{
  const known=Boolean(g.rule),frequency=g.count/records.length;
  const confidence=known?Math.min(0.99,Number((g.rule.confidence+Math.min(0.07,frequency*0.07)).toFixed(2))):0.25;
  return {code,category:g.rule?.category||'unclassified',severity:g.rule?.severity||'unknown',cause:g.rule?.cause||'Insufficient structured evidence to identify a likely cause',recommendedInvestigation:g.rule?.action||'Collect a structured error code, stage and correlated diagnostic evidence',confidence,confidenceLabel:confidence>=0.85?'high':confidence>=0.6?'medium':'low',occurrences:g.count,evidenceIds:g.evidenceIds.slice(0,MAX_RECORDS),stages:[...g.stages].slice(0,20),sources:[...g.sources].slice(0,20),messageSamples:g.messages};
 }).sort((a,b)=>b.occurrences-a.occurrences||b.confidence-a.confidence).slice(0,MAX_HYPOTHESES);
 return {status:'diagnosed',evidenceCount:records.length,hypothesisCount:hypotheses.length,primaryHypothesis:hypotheses[0]||null,hypotheses,limitations:['Diagnosis is deterministic and based only on supplied evidence.','Confidence is a heuristic, not a calibrated probability.','No code, configuration or production state was changed.'],generatedAt:new Date().toISOString()};
}
export function getFailureDiagnosisStatus(){return {name:'BAYE Automatic Failure Diagnosis Engine',milestone:'G79',version:'0.1.0',mode:'bounded deterministic evidence analysis',limits:{maxEvidenceRecords:MAX_RECORDS,maxHypotheses:MAX_HYPOTHESES},executesRepairs:false,networkAccess:false,repositoryAccess:false};}
