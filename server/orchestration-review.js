// Deterministic integrity review of specialist execution results.
// This module checks traceability and completeness, not the truth of model claims.
function issue(code,message,severity='warning'){return {code,message,severity};}
export function reviewOrchestrationResults({results,taskStates}={}) {
 const findings=[];
 const rows=Array.isArray(results)?results:[];
 if(rows.length===0) findings.push(issue('NO_RESULTS','Aucun rapport spécialiste disponible.','error'));
 const seenContent=new Map();
 for(const row of rows){
  const id=typeof row?.taskId==='string'?row.taskId:'unknown';
  const state=taskStates&&typeof taskStates==='object'?taskStates[id]:null;
  if(!row||row.status!=='succeeded'){
   findings.push(issue('TASK_NOT_SUCCEEDED','La tâche '+id+' ne s’est pas terminée avec succès.','error'));
   continue;
  }
  if(!state||state.status!=='succeeded') findings.push(issue('STATE_MISMATCH','L’état traçable de '+id+' ne confirme pas la réussite.'));
  const content=row.output?.content;
  if(typeof content!=='string'||!content.trim()){
   findings.push(issue('EMPTY_REPORT','Le rapport de '+id+' est absent ou vide.','error'));
   continue;
  }
  const normalized=content.trim().replace(/\s+/g,' ').toLowerCase();
  const previous=seenContent.get(normalized);
  if(previous) findings.push(issue('DUPLICATE_REPORT','Les rapports de '+previous+' et '+id+' sont identiques.'));
  else seenContent.set(normalized,id);
 }
 const errors=findings.filter(item=>item.severity==='error').length;
 return {
  status:errors?'incomplete':findings.length?'needs_review':'complete',
  checkedAt:'execution_time',
  taskCount:rows.length,
  findings,
  checks:{resultTraceability:true,completionStateConsistency:true,duplicateReportDetection:true,semanticContradictionDetection:false,independentFactVerification:false},
  notice:'Contrôle déterministe de complétude et de traçabilité uniquement. Ce contrôle ne valide pas la véracité des affirmations et ne détecte pas les contradictions sémantiques.'
 };
}
