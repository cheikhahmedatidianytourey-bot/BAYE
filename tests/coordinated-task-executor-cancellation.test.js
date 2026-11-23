import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoordinatedTaskExecutor} from '../server/coordinated-task-executor.js';

const claim={ownerId:'a'.repeat(64),missionId:'mission_unit',taskId:'task_unit',claimOwner:'worker-unit',idempotencyKey:'mission_unit:task_unit:v1',fencingToken:'1'};

test('lease loss aborts cooperative execution and refuses completion',async()=>{
 let settledStatus=null;
 const store={
  claim:async()=>claim,
  renew:async()=>null,
  settle:async(input)=>{settledStatus=input.status;return null;}
 };
 const adapter=createCoordinatedTaskExecutor({store,ownerId:claim.ownerId,missionId:claim.missionId,claimOwner:claim.claimOwner,leaseMs:1000,renewEveryMs:250});
 let signalObserved=false;
 await assert.rejects(adapter.executeTask({task:{id:claim.taskId},execute:({signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>{signalObserved=true;reject(signal.reason);},{once:true});
 })}),/lease renewal refused|lease lost/i);
 assert.equal(signalObserved,true,'worker should observe abort signal');
 assert.equal(settledStatus,'needs_review');
});

test('successful work receives a non-aborted signal',async()=>{
 const store={claim:async()=>claim,renew:async()=>claim,settle:async(input)=>({...claim,status:input.status})};
 const adapter=createCoordinatedTaskExecutor({store,ownerId:claim.ownerId,missionId:claim.missionId,claimOwner:claim.claimOwner,leaseMs:1000,renewEveryMs:250});
 const output=await adapter.executeTask({task:{id:claim.taskId},execute:async({signal})=>{assert.equal(signal.aborted,false);return 'ok';}});
 assert.equal(output,'ok');
});
