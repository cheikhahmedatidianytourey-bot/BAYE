// Bounded checkpoint validation and in-memory adapter. No disk or network I/O.
const fail=(message)=>{throw new Error(message);};
const TASK_STATUSES=new Set(['pending','ready','running','succeeded','failed','cancelled','needs_review']);
const MAX_CHECKPOINT_BYTES=200000;
const ID=/^[-a-zA-Z0-9_]{1,64}$/;
function serializedSize(value){let text;try{text=JSON.stringify(value);}catch{fail('Checkpoint non sérialisable.');}if(typeof text!=='string')fail('Checkpoint non sérialisable.');return text.length;}
export function validateMissionCheckpoint(checkpoint,{missionId,graphDigest}={}){
 if(!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint))fail('Checkpoint invalide.');
 if(serializedSize(checkpoint)>MAX_CHECKPOINT_BYTES)fail('Checkpoint trop volumineux.');
 if(checkpoint.schemaVersion!==1)fail('Version de checkpoint inconnue.');
 if(typeof checkpoint.missionId!=='string'||!ID.test(checkpoint.missionId)||checkpoint.missionId!==missionId)fail('Mission checkpoint mismatch.');
 if(typeof checkpoint.graphDigest!=='string'||checkpoint.graphDigest.length<8||checkpoint.graphDigest.length>128||checkpoint.graphDigest!==graphDigest)fail('Graphe checkpoint mismatch.');
 if(!['running','failed','cancelled','succeeded','needs_review'].includes(checkpoint.status))fail('Statut de mission invalide.');
 if(!Number.isSafeInteger(checkpoint.revision)||checkpoint.revision<0)fail('Révision checkpoint invalide.');
 if(typeof checkpoint.updatedAt!=='string'||!Number.isFinite(Date.parse(checkpoint.updatedAt)))fail('Horodatage checkpoint invalide.');
 if(!checkpoint.tasks||typeof checkpoint.tasks!=='object'||Array.isArray(checkpoint.tasks))fail('Tâches checkpoint invalides.');
 for(const [id,task] of Object.entries(checkpoint.tasks)){
  if(!ID.test(id)||!task||typeof task!=='object'||Array.isArray(task))fail('Contrat tâche checkpoint invalide.');
  if(!TASK_STATUSES.has(task.status)||!Number.isSafeInteger(task.attempt)||task.attempt<0)fail('État ou compteur tâche invalide.');
  if(task.history!==undefined&&!Array.isArray(task.history))fail('Historique checkpoint invalide.');
  if(task.output!==undefined&&serializedSize(task.output)>50000)fail('Sortie checkpoint trop volumineuse.');
 }
 return JSON.parse(JSON.stringify(checkpoint));
}
export function createMissionCheckpoint({missionId,graphDigest,tasks={},status='running',revision=0,updatedAt=new Date().toISOString()}){
 const checkpoint={schemaVersion:1,missionId,graphDigest,status,revision,tasks,updatedAt};
 return validateMissionCheckpoint(checkpoint,{missionId,graphDigest});
}
export function createInMemoryCheckpointStore(){
 const records=new Map();
 return Object.freeze({
  async load(missionId){const value=records.get(missionId);return value?JSON.parse(JSON.stringify(value)):null;},
  async save(checkpoint,{expectedRevision=null}={}){
   const validated=validateMissionCheckpoint(checkpoint,{missionId:checkpoint?.missionId,graphDigest:checkpoint?.graphDigest});
   const existing=records.get(validated.missionId);
   if(expectedRevision===null){if(existing)fail('Checkpoint exists; revision guard required.');}
   else if((existing?.revision??-1)!==expectedRevision)fail('Checkpoint revision conflict.');
   if(existing&&validated.revision<=existing.revision)fail('Révision checkpoint doit progresser.');
   if(!existing&&validated.revision<0)fail('Révision checkpoint invalide.');
   records.set(validated.missionId,validated);
   return JSON.parse(JSON.stringify(validated));
  },
  async delete(missionId){records.delete(missionId);}
 });
}
