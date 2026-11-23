/**
 * Conservative execution adapter around the PostgreSQL claim store.
 * A claim is settled completed only after the executor returns. Any executor
 * exception is marked needs_review: the outcome may be externally ambiguous.
 * Claim denial fails closed; no worker invocation occurs.
 */
export function createCoordinatedTaskExecutor({store,ownerId,missionId,claimOwner,leaseMs=30_000}={}){
 if(!store||typeof store.claim!=='function'||typeof store.settle!=='function')throw new TypeError('Coordination store is required.');
 for(const [key,value] of Object.entries({ownerId,missionId,claimOwner}))if(typeof value!=='string'||!value)throw new TypeError(key+' is required.');
 if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new TypeError('Invalid coordination lease.');
 return Object.freeze({
  async executeTask({task,dependencies,missionMemory,execute}={}){
   if(!task||typeof task.id!=='string'||typeof execute!=='function')throw new TypeError('Task and executor are required.');
   const idempotencyKey=missionId+':'+task.id+':v1';
   const claim=await store.claim({ownerId,missionId,taskId:task.id,claimOwner,idempotencyKey,leaseMs});
   if(!claim)throw new Error('Task coordination claim denied; execution blocked.');
   let output;
   try{
    output=await execute({task,dependencies,missionMemory});
    const settled=await store.settle({...claim,status:'completed'});
    if(!settled)throw new Error('Coordination claim lost before completion settlement.');
    return output;
   }catch(error){
    try{await store.settle({...claim,status:'needs_review'});}catch(_settleError){}
    throw error;
   }
  }
 });
}
