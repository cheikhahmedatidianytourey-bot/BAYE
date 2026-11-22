// Pure task lifecycle state machine. It records transitions; it never executes work.
const ALLOWED = Object.freeze({
  pending: Object.freeze(['ready','cancelled']),
  ready: Object.freeze(['running','cancelled']),
  running: Object.freeze(['succeeded','failed','cancelled']),
  succeeded: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([])
});
const STATUSES = new Set(Object.keys(ALLOWED));
function fail(message){throw new Error(message);}
function validateState(state){
 if(!state||typeof state!=='object'||Array.isArray(state))fail('État de tâche invalide.');
 if(typeof state.taskId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(state.taskId))fail('Identifiant de tâche invalide.');
 if(!STATUSES.has(state.status))fail('Statut de tâche inconnu.');
 if(!Number.isSafeInteger(state.revision)||state.revision<0)fail('Révision de tâche invalide.');
 if(!Array.isArray(state.history)||state.history.length!==state.revision)fail('Historique de transitions incohérent.');
}
export function createTaskState(taskId){
 if(typeof taskId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(taskId))fail('Identifiant de tâche invalide.');
 return Object.freeze({taskId,status:'pending',revision:0,history:Object.freeze([])});
}
export function transitionTaskState(state,nextStatus,options={}){
 validateState(state);
 if(!STATUSES.has(nextStatus))fail('Nouveau statut inconnu.');
 if(!options||typeof options!=='object'||Array.isArray(options))fail('Options de transition invalides.');
 if(Object.keys(options).some(key=>key!=='reason'))fail('Option de transition non autorisée.');
 if(!ALLOWED[state.status].includes(nextStatus))fail('Transition interdite: '+state.status+' -> '+nextStatus+'.');
 const reason=options.reason;
 if(nextStatus==='failed'||nextStatus==='cancelled'){
  if(typeof reason!=='string'||!reason.trim()||reason.length>500)fail('Un motif valide est requis pour cet arrêt.');
 } else if(reason!==undefined&&(typeof reason!=='string'||reason.length>500)) {
  fail('Motif de transition invalide.');
 }
 const event=Object.freeze({
  revision:state.revision+1,
  from:state.status,
  to:nextStatus,
  ...(reason===undefined?{}:{reason:reason.trim()})
 });
 return Object.freeze({
  taskId:state.taskId,
  status:nextStatus,
  revision:event.revision,
  history:Object.freeze([...state.history,event])
 });
}
export function getTaskStateTransitions(){
 return Object.fromEntries(Object.entries(ALLOWED).map(([status,next])=>[status,[...next]]));
}
