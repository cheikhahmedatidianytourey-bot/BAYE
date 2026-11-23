import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoordinatedTaskExecutor} from '../server/coordinated-task-executor.js';

const config={ownerId:'a'.repeat(64),missionId:'mission_12345678',claimOwner:'worker-test',leaseMs:10000};

test('claim denial blocks worker invocation',async()=>{
 let invoked=false;
 const adapter=createCoordinatedTaskExecutor({store:{claim:async()=>null,settle:async()=>null},...config});
 await assert.rejects(adapter.executeTask({task:{id:'task1'},execute:async()=>{invoked=true;return {ok:true}}}),/claim denied/i);
 assert.equal(invoked,false);
});

test('successful execution settles claim completed before returning output',async()=>{
 const calls=[];const claim={ownerId:config.ownerId,missionId:config.missionId,taskId:'task1',claimOwner:config.claimOwner,idempotencyKey:'mission_12345678:task1:v1',fencingToken:'1'};
 const store={claim:async()=>claim,settle:async(input)=>{calls.push(input.status);return {...claim,status:input.status}}};
 const adapter=createCoordinatedTaskExecutor({store,...config});
 const output=await adapter.executeTask({task:{id:'task1'},execute:async()=>({answer:42})});
 assert.deepEqual(output,{answer:42});assert.deepEqual(calls,['completed']);
});

test('executor failure is marked needs_review and rethrown',async()=>{
 const calls=[];const claim={ownerId:config.ownerId,missionId:config.missionId,taskId:'task1',claimOwner:config.claimOwner,idempotencyKey:'mission_12345678:task1:v1',fencingToken:'1'};
 const store={claim:async()=>claim,settle:async(input)=>{calls.push(input.status);return {...claim,status:input.status}}};
 const adapter=createCoordinatedTaskExecutor({store,...config});
 await assert.rejects(adapter.executeTask({task:{id:'task1'},execute:async()=>{throw new Error('ambiguous')}}),/ambiguous/);
 assert.deepEqual(calls,['needs_review']);
});

test('lost claim during success settlement fails closed',async()=>{
 const claim={ownerId:config.ownerId,missionId:config.missionId,taskId:'task1',claimOwner:config.claimOwner,idempotencyKey:'mission_12345678:task1:v1',fencingToken:'1'};
 let invoked=0;const store={claim:async()=>claim,settle:async()=>null};
 const adapter=createCoordinatedTaskExecutor({store,...config});
 await assert.rejects(adapter.executeTask({task:{id:'task1'},execute:async()=>{invoked++;return {ok:true}}}),/lost before completion/i);
 assert.equal(invoked,1);
});
