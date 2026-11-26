// BAYE V6 G12 — bounded, idempotent HTTP + storage shutdown.
export function createShutdownCoordinator({server,closeStorage,timeoutMs=20000,logger=console}){
 if(!server||typeof server.close!=='function')throw new TypeError('HTTP server is required.');
 if(typeof closeStorage!=='function')throw new TypeError('Storage close function is required.');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1)throw new TypeError('Shutdown timeout must be positive.');
 let promise;
 return signal=>{
  if(promise)return promise;
  promise=(async()=>{
   logger.log('BAYE shutdown initiated',signal);
   let serverError=null;
   let timer;
   try{
    await Promise.race([
     new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),
     new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('HTTP shutdown timeout')),timeoutMs);})
    ]);
   }catch(error){
    serverError=error;
    try{server.closeAllConnections?.();}catch{}
   }finally{if(timer)clearTimeout(timer);}
   let storageError=null;
   try{await closeStorage();}catch(error){storageError=error;}
   if(serverError||storageError){
    logger.error('BAYE shutdown completed with errors',{server:serverError?.message,storage:storageError?.message});
    throw new Error('BAYE shutdown was not clean.');
   }
   logger.log('BAYE shutdown completed.');
  })();
  return promise;
 };
}
