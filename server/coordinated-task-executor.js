/**
 * Conservative execution adapter around the coordination claim store.
 * Periodically renews a lease during execution and fails closed on lease loss.
 * Worker cancellation is cooperative and is not guaranteed by this adapter.
 */
export function createCoordinatedTaskExecutor({store,ownerId,missionId,claimOwner,leaseMs=30_000,renewEveryMs=Math.floor(leaseMs/3)}={}){
 if(!store||typeof store.claim!=='function'||typeof store.settle!=='function'||typeof store.renew!=='function')throw new TypeError('Coordination store with claim, renew and settle is required.');
 for(const [key,value] of Object.entries({ownerId,missionId,claimOwner}))if(typeof value!=='string'||!value)throw new TypeError(key+' is required.');
 if(!Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw new TypeError('Invalid coordination lease.');
 if(!Number.isSafeInteger(renewEveryMs)||renewEveryMs<250||renewEveryMs>=leaseMs)throw new TypeError('Renewal interval must be at least 250ms and shorter than the lease.');
 return Object.freeze({
  async executeTask({task,dependencies,missionMemory,execute}={}){
   if(!task||typeof task.id!=='string'||typeof execute!=='function')throw new TypeError('Task and executor are required.');
   const idempotencyKey=missionId+':'+task.id+':v1';
   const claim=await store.claim({ownerId,missionId,taskId:task.id,claimOwner,idempotencyKey,leaseMs});
   if(!claim)throw new Error('Task coordination claim denied; execution blocked.');
   let timer=null,renewalStopped=false,renewalInFlight=false,leaseLostError=null;
   let rejectLeaseLost;
   const leaseLost=new Promise((_,reject)=>{rejectLeaseLost=reject;});
   // Attach a handler immediately to avoid an unhandled rejection when execution completes first.
   leaseLost.catch(()=>{});
   const loseLease=(error)=>{if(!leaseLostError){leaseLostError=error instanceof Error?error:new Error('Coordination lease lost.');rejectLeaseLost(leaseLostError);}};
   const scheduleRenewal=()=>{
    if(renewalStopped||leaseLostError)return;
    timer=setTimeout(async()=>{
     if(renewalStopped||renewalInFlight)return;
     renewalInFlight=true;
     try{
      const renewed=await store.renew({...claim,leaseMs});
      if(!renewed)loseLease(new Error('Coordination lease renewal refused; execution is no longer authorized.'));
     }catch(error){loseLease(error);}
     finally{renewalInFlight=false;if(!renewalStopped&&!leaseLostError)scheduleRenewal();}
    },renewEveryMs);
    timer.unref?.();
   };
   scheduleRenewal();
   try{
    const work=Promise.resolve().then(()=>execute({task,dependencies,missionMemory}));
    const output=await Promise.race([work,leaseLost]);
    if(leaseLostError)throw leaseLostError;
    renewalStopped=true;if(timer)clearTimeout(timer);
    const settled=await store.settle({...claim,status:'completed'});
    if(!settled)throw new Error('Coordination claim lost before completion settlement.');
    return output;
   }catch(error){
    renewalStopped=true;if(timer)clearTimeout(timer);
    try{await store.settle({...claim,status:'needs_review'});}catch(_settleError){}
    throw error;
   }finally{
    renewalStopped=true;if(timer)clearTimeout(timer);
   }
  }
 });
}
