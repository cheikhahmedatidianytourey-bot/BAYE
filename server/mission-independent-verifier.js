// Independent deterministic post-execution integrity verifier.
// It validates structure, traceability and dependency-result presence; it does not establish factual truth.
const MAX_OUTPUT=50000;
function finding(code,message,severity='warning',taskId=null){return {code,message,severity,taskId};}
export function verifyMissionExecution({tasks,results,taskStates}={}){
 const findings=[];
 if(!Array.isArray(tasks)||tasks.length<1||tasks.length>5)return {status:'blocked',findings:[finding('INVALID_PLAN','Le plan transmis au vérificateur est invalide.','error')],checks:{planShape:false,resultCoverage:false,dependencyTraceability:false,outputIntegrity:false,factualAccuracy:false}};
 if(!Array.isArray(results))results=[];
 const expected=new Map(tasks.map(t=>[t.id,t]));
 const resultMap=new Map();
 for(const row of results){
  if(!row||typeof row.taskId!=='string'||resultMap.has(row.taskId)){findings.push(finding('DUPLICATE_OR_INVALID_RESULT','Résultat invalide ou tâche dupliquée.','error'));continue;}
  resultMap.set(row.taskId,row);
 }
 for(const id of resultMap.keys())if(!expected.has(id))findings.push(finding('UNEXPECTED_RESULT','Résultat pour une tâche non prévue.','error',id));
 for(const task of tasks){
  const row=resultMap.get(task.id),state=taskStates?.[task.id];
  if(!row){findings.push(finding('MISSING_RESULT','Résultat absent pour '+task.id+'.','error',task.id));continue;}
  if(row.status!=='succeeded'||state?.status!=='succeeded')findings.push(finding('STATE_NOT_CONFIRMED','Réussite de la tâche non confirmée par les deux états.', 'error',task.id));
  const content=row.output?.content;
  if(typeof content!=='string'||!content.trim())findings.push(finding('EMPTY_OUTPUT','Sortie spécialiste vide ou non textuelle.','error',task.id));
  else if(content.length>MAX_OUTPUT)findings.push(finding('OUTPUT_TOO_LARGE','Sortie spécialiste dépassant la limite de taille.','error',task.id));
  if(row.output?.taskId&&row.output.taskId!==task.id)findings.push(finding('TASK_ID_MISMATCH','Identifiant de tâche discordant dans la sortie.','error',task.id));
  for(const dep of task.dependsOn||[]){
   if(!resultMap.has(dep))findings.push(finding('DEPENDENCY_RESULT_MISSING','Résultat de dépendance '+dep+' absent.','error',task.id));
  }
 }
 const errors=findings.filter(x=>x.severity==='error').length;
 return {
  status:errors?'blocked':findings.length?'review_required':'integrity_passed',
  findings,
  checks:{planShape:true,resultCoverage:results.length===tasks.length&&findings.every(x=>x.code!=='MISSING_RESULT'&&x.code!=='UNEXPECTED_RESULT'),dependencyTraceability:findings.every(x=>x.code!=='DEPENDENCY_RESULT_MISSING'),outputIntegrity:findings.every(x=>!['EMPTY_OUTPUT','OUTPUT_TOO_LARGE','STATE_NOT_CONFIRMED','TASK_ID_MISMATCH'].includes(x.code)),factualAccuracy:false,independentFactVerification:false},
  verifiedAt:'execution_time',
  notice:'Vérification indépendante déterministe des structures et de la traçabilité. Elle ne valide ni la vérité des affirmations, ni les sources externes, ni l’exactitude factuelle.'
 };
}
