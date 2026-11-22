import test from 'node:test';
import assert from 'node:assert/strict';
import {runAuthenticatedOrchestration} from '../server/authenticated-orchestration.js';

const memory={version:1,missionId:'mission_12345678',entries:[],digest:'test'};
function storeFixture({saved=null,failLoad=false,failSave=false}={}){
 const calls=[];
 return {calls,load:async args=>{calls.push(['load',args]);if(failLoad)throw new Error('disk unavailable');return saved;},save:async args=>{calls.push(['save',args]);if(failSave)throw new Error('disk unavailable');}};
}
test('loads only the verified owner memory and persists successful mission output',async()=>{
 const store=storeFixture({saved:{memory}});
 let received;
 const result=await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',missionId:memory.missionId,tasks:[],run:async args=>{received=args;return {status:'succeeded',missionMemory:{...memory,entries:[{taskId:'r',role:'research',excerpt:'new'}]}};}});
 assert.equal(received.priorMemory,memory);
 assert.equal(store.calls[0][1].ownerId,'account:user-123456');
 assert.equal(store.calls[1][1].ownerId,'account:user-123456');
 assert.equal(result.memoryPersistence.status,'saved');
});
test('starts a new authenticated mission without prior memory when no mission ID is supplied',async()=>{
 const store=storeFixture();let received;
 await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',run:async args=>{received=args;return {status:'failed'};}});
 assert.equal(received.priorMemory,null);
 assert.equal(store.calls.length,0);
});
test('does not run a mission if persistent memory cannot be loaded',async()=>{
 const store=storeFixture({failLoad:true});let ran=false;
 await assert.rejects(()=>runAuthenticatedOrchestration({store,ownerId:'account:user-123456',missionId:memory.missionId,run:async()=>{ran=true;return {status:'succeeded'};}}),error=>error.code==='MISSION_MEMORY_LOAD_FAILED');
 assert.equal(ran,false);
});
test('reports persistence failure without discarding a completed mission result',async()=>{
 const store=storeFixture({failSave:true});
 const result=await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',run:async()=>({status:'succeeded',missionMemory:memory})});
 assert.equal(result.status,'succeeded');
 assert.equal(result.memoryPersistence.status,'unavailable');
});
test('does not persist failed missions',async()=>{
 const store=storeFixture();
 const result=await runAuthenticatedOrchestration({store,ownerId:'account:user-123456',run:async()=>({status:'failed'})});
 assert.equal(store.calls.length,0);
 assert.equal(result.memoryPersistence.status,'not_saved');
});
