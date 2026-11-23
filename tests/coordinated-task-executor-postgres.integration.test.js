import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {createPostgresMissionCoordinationStore} from '../server/mission-coordination-store.js';
import {createCoordinatedTaskExecutor} from '../server/coordinated-task-executor.js';

const url=process.env.BAYE_TEST_DATABASE_URL;
test('PostgreSQL runtime integration: coordinated adapter renews and settles real claims', {skip:!url}, async()=>{
 const pool=new pg.Pool({connectionString:url,max:4});
 const store=createPostgresMissionCoordinationStore({pool});
 const ownerId=crypto.createHash('sha256').update('baye-v5-integration-'+crypto.randomUUID()).digest('hex');
 const missionId='pg_runtime_'+crypto.randomUUID().replace(/-/g,'').slice(0,20);
 const claimOwner='runtime-integration-worker';
 const task={id:'runtime_task'};
 try{
  await store.ensureSchema();
  const adapter=createCoordinatedTaskExecutor({store,ownerId,missionId,claimOwner,leaseMs:1200,renewEveryMs:300});
  const output=await adapter.executeTask({task,execute:async()=>new Promise(resolve=>setTimeout(()=>resolve({integration:true}),1800))});
  assert.deepEqual(output,{integration:true});
  const settled=await store.inspect({ownerId,missionId,taskId:task.id});
  assert.ok(settled);
  assert.equal(settled.status,'completed');
  assert.equal(settled.claimOwner,claimOwner);
  assert.ok(BigInt(settled.fencingToken)>=1n);
 }finally{
  await pool.query('DELETE FROM baye_mission_task_claims WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
  await pool.end();
 }
});

test('PostgreSQL runtime integration: active real claim blocks competing adapter', {skip:!url}, async()=>{
 const pool=new pg.Pool({connectionString:url,max:4});
 const store=createPostgresMissionCoordinationStore({pool});
 const ownerId=crypto.createHash('sha256').update('baye-v5-denial-'+crypto.randomUUID()).digest('hex');
 const missionId='pg_deny_'+crypto.randomUUID().replace(/-/g,'').slice(0,20);
 const task={id:'denied_task'};
 try{
  await store.ensureSchema();
  const first=createCoordinatedTaskExecutor({store,ownerId,missionId,claimOwner:'worker-one',leaseMs:5000,renewEveryMs:1000});
  const second=createCoordinatedTaskExecutor({store,ownerId,missionId,claimOwner:'worker-two',leaseMs:5000,renewEveryMs:1000});
  let invokedSecond=false;
  let releaseFirst;
  const firstWork=new Promise(resolve=>{releaseFirst=resolve;});
  const running=first.executeTask({task,execute:async()=>firstWork});
  await new Promise(resolve=>setTimeout(resolve,100));
  await assert.rejects(second.executeTask({task,execute:async()=>{invokedSecond=true;return 'unsafe';}}),/claim denied/i);
  assert.equal(invokedSecond,false);
  releaseFirst('released-test');
  assert.equal(await running,'released-test');
 }finally{
  await pool.query('DELETE FROM baye_mission_task_claims WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
  await pool.end();
 }
});

test('PostgreSQL runtime integration: expired claim is reclaimed and fencing blocks stale settlement', {skip:!url}, async()=>{
 const pool=new pg.Pool({connectionString:url,max:4});
 const store=createPostgresMissionCoordinationStore({pool});
 const ownerId=crypto.createHash('sha256').update('baye-v5-reclaim-'+crypto.randomUUID()).digest('hex');
 const missionId='pg_reclaim_'+crypto.randomUUID().replace(/-/g,'').slice(0,20);
 const taskId='reclaim_task';
 const idempotencyKey=missionId+':'+taskId+':v1';
 try{
  await store.ensureSchema();
  const first=await store.claim({ownerId,missionId,taskId,claimOwner:'stale-worker',idempotencyKey,leaseMs:1000});
  assert.ok(first);
  await new Promise(resolve=>setTimeout(resolve,1150));
  const second=await store.claim({ownerId,missionId,taskId,claimOwner:'recovery-worker',idempotencyKey,leaseMs:5000});
  assert.ok(second,'expired claim should be reclaimable');
  assert.ok(BigInt(second.fencingToken)>BigInt(first.fencingToken),'reclaim should advance fencing token');
  const staleSettlement=await store.settle({...first,status:'completed'});
  assert.equal(staleSettlement,null,'stale claimant must not settle reclaimed work');
  const accepted=await store.settle({...second,status:'completed'});
  assert.ok(accepted,'current claimant should settle successfully');
  assert.equal(accepted.status,'completed');
 }finally{
  await pool.query('DELETE FROM baye_mission_task_claims WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
  await pool.end();
 }
});
