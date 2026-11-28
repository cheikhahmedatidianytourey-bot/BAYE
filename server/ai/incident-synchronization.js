// G73: controlled synchronization between in-memory tracker and persistent storage.
export async function synchronizeIncidents({listTracked,listStored,saveRecord,restoreTracked,max=200}={}){
 if(typeof listTracked!=='function'||typeof listStored!=='function'||typeof saveRecord!=='function'||typeof restoreTracked!=='function')return {status:'rejected',reason:'synchronization dependencies required'};
 const bounded=Math.min(200,Math.max(1,Number.isInteger(max)?max:200));
 const persisted=await listStored({limit:bounded});
 const restored=restoreTracked(persisted?.items||[]);
 const tracked=listTracked({limit:bounded});
 const items=Array.isArray(tracked?.items)?tracked.items.slice(0,bounded):[];
 let saved=0,failed=0,capacity=0;
 for(const incident of items){const result=await saveRecord(incident);if(result?.status==='stored')saved++;else if(result?.status==='capacity')capacity++;else failed++;}
 return {status:failed||capacity?'partial':'synchronized',restored:restored?.restored||0,attempted:items.length,saved,failed,capacity,limit:bounded,storage:'postgresql'};
}
