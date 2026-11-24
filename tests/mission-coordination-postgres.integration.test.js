import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createPostgresMissionCoordinationStore} from '../server/mission-coordination-store.js';

const url=process.env.BAYE_TEST_DATABASE_URL;
test('PostgreSQL integration: atomic competing claims, reclaim and fencing', {skip:!url}, async()=>{
 const pool=new pg.Pool({connectionString:url,max:8});
 const store=createPostgresMissionCoordinationStore({pool});
 const ownerId='b'.repeat(64),missionId='pg_integration_1',taskId='atomic_task';
 const key='pg_integration_1:atomic_task:v1';
 try{
  await store.ensureSchema();
  await pool.query('DELETE FROM baye_mission_task_claims WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
  const claims=await Promise.all([
   store.claim({ownerId,missionId,taskId,claimOwner:'worker-a',idempotencyKey:key,leaseMs:10_000}),
   store.claim({ownerId,missionId,taskId,claimOwner:'worker-b',idempotencyKey:key,leaseMs:10_000})
  ]);
  assert.equal(claims.filter(Boolean).length,1,'only one simultaneous claimant should win');
  const winner=claims.find(Boolean);
  assert.ok(winner);
  assert.equal(await store.claim({ownerId,missionId,taskId,claimOwner:'worker-c',idempotencyKey:'other_key_v2',leaseMs:10_000}),null,'different idempotency key cannot replace active claim');
  const settled=await store.settle({...winner,status:'retryable'});
  assert.equal(settled.status,'retryable');
  const snapshot=await store.inspect({ownerId,missionId,taskId});
  assert.equal(snapshot.leaseExpired,true,'database should report the settled lease as expired');
  const reclaimed=await store.reclaim({ownerId,missionId,taskId,claimOwner:'worker-c',idempotencyKey:key,leaseMs:10_000,fencingToken:snapshot.fencingToken});
  assert.ok(reclaimed);
  assert.equal(BigInt(reclaimed.fencingToken),BigInt(winner.fencingToken)+1n);
  assert.equal(await store.reclaim({ownerId,missionId,taskId,claimOwner:'worker-d',idempotencyKey:key,leaseMs:10_000,fencingToken:snapshot.fencingToken}),null,'stale snapshot cannot reclaim twice');
  assert.equal(await store.renew({...winner,leaseMs:10_000}),null,'stale fencing token must not renew');
  assert.equal(await store.settle({...winner,status:'completed'}),null,'stale fencing token must not settle');
  assert.equal((await store.inspect({ownerId,missionId,taskId})).claimOwner,'worker-c');
 }finally{
  await pool.query('DELETE FROM baye_mission_task_claims WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
  await pool.end();
 }
});
