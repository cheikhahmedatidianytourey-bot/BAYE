export async function runAuthenticatedOrchestration({store,ownerId,missionId=null,tasks,run}={}){
 if(!store||typeof store.load!=='function'||typeof store.save!=='function')throw new TypeError('Persistent mission memory store is required.');
 if(typeof ownerId!=='string'||!ownerId)throw new TypeError('Verified owner identity is required.');
 if(typeof run!=='function')throw new TypeError('Mission runner is required.');
 let priorMemory=null;
 if(missionId!==null){
  try{const saved=await store.load({ownerId,missionId});priorMemory=saved?.memory??null;}
  catch(_error){const unavailable=new Error('Persistent mission memory could not be loaded.');unavailable.code='MISSION_MEMORY_LOAD_FAILED';throw unavailable;}
 }
 const result=await run({tasks,missionId,priorMemory});
 if(result?.status==='succeeded'){
  try{await store.save({ownerId,memory:result.missionMemory});result.memoryPersistence={status:'saved',missionId:result.missionMemory.missionId};}
  catch(_error){result.memoryPersistence={status:'unavailable',missionId:result.missionMemory?.missionId||null,notice:'Mission terminée, mais sa mémoire n’a pas pu être enregistrée.'};}
 }else result.memoryPersistence={status:'not_saved',reason:'mission_not_succeeded'};
 return result;
}
