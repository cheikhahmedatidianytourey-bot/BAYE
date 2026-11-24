import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresMissionCoordinationStore,MISSION_COORDINATION_SCHEMA_SQL} from '../server/mission-coordination-store.js';

const base={ownerId:'a'.repeat(64),missionId:'mission_123456',taskId:'research',claimOwner:'worker-a',idempotencyKey:'mission_123456:research:v1',leaseMs:30_000};
function fakePool(rows=[]){
 const calls=[];
 return {calls,async query(sql,values){calls.push({sql,values});return {rows:rows.shift()??[]};}};
}

test('requires a PostgreSQL-compatible pool',()=>{
 assert.throws(()=>createPostgresMissionCoordinationStore(),/pool is required/);
 assert.throws(()=>createPostgresMissionCoordinationStore({pool:{}}),/pool is required/);
});

test('exposes explicit idempotent schema initialization',async()=>{
 const pool=fakePool();const store=createPostgresMissionCoordinationStore({pool});
 assert.deepEqual(await store.ensureSchema(),{ready:true});
 assert.match(pool.calls[0].sql,/CREATE TABLE IF NOT EXISTS baye_mission_task_claims/);
 assert.match(pool.calls[0].sql,/PRIMARY KEY \(owner_id, mission_id, task_id\)/);
});

test('claim uses a single conditional upsert and returns the fencing token',async()=>{
 const pool=fakePool([[{owner_id:base.ownerId,mission_id:base.missionId,task_id:base.taskId,claim_owner:'worker-a',idempotency_key:base.idempotencyKey,lease_expires_at:new Date(),fencing_token:'7'}]]);
 const store=createPostgresMissionCoordinationStore({pool});
 const claim=await store.claim(base);
 assert.equal(claim.fencingToken,'7');
 assert.equal(claim.claimOwner,'worker-a');
 assert.match(pool.calls[0].sql,/ON CONFLICT \(owner_id,mission_id,task_id\) DO UPDATE/);
 assert.match(pool.calls[0].sql,/fencing_token=baye_mission_task_claims\.fencing_token\+1/);
 assert.match(pool.calls[0].sql,/idempotency_key=EXCLUDED\.idempotency_key/);
 assert.match(pool.calls[0].sql,/lease_expires_at<=NOW\(\)/);
 assert.equal(pool.calls[0].values[4],base.idempotencyKey);
});

test('a competing or duplicate claim is represented by null when the atomic update returns no row',async()=>{
 const pool=fakePool([[]]);const store=createPostgresMissionCoordinationStore({pool});
 assert.equal(await store.claim(base),null);
});

test('inspect returns database-derived lease expiry and metadata only',async()=>{
 const pool=fakePool([[{owner_id:base.ownerId,mission_id:base.missionId,task_id:base.taskId,claim_owner:'worker-a',idempotency_key:base.idempotencyKey,lease_expires_at:new Date(),fencing_token:'1',status:'claimed',lease_expired:true}]]);
 const store=createPostgresMissionCoordinationStore({pool});
 const result=await store.inspect(base);
 assert.equal(result.status,'claimed');
 assert.equal(result.leaseExpired,true);
 assert.equal(result.fencingToken,'1');
 assert.equal(Object.hasOwn(result,'output'),false);
 assert.match(pool.calls[0].sql,/lease_expires_at<=NOW\(\)\) AS lease_expired/);
});

test('reclaim is a compare-and-swap against the inspected fencing generation',async()=>{
 const pool=fakePool([[{owner_id:base.ownerId,mission_id:base.missionId,task_id:base.taskId,claim_owner:'worker-b',idempotency_key:base.idempotencyKey,lease_expires_at:new Date(),fencing_token:'8'}]]);
 const store=createPostgresMissionCoordinationStore({pool});
 const claim=await store.reclaim({...base,claimOwner:'worker-b',fencingToken:'7'});
 assert.equal(claim.fencingToken,'8');
 assert.match(pool.calls[0].sql,/fencing_token=\$6::BIGINT/);
 assert.match(pool.calls[0].sql,/idempotency_key=\$5/);
 assert.match(pool.calls[0].sql,/lease_expires_at<=NOW\(\)/);
 assert.equal(pool.calls[0].values[5],'7');
});

test('reclaim rejects malformed fencing tokens before SQL',async()=>{
 const pool=fakePool();const store=createPostgresMissionCoordinationStore({pool});
 await assert.rejects(()=>store.reclaim({...base,fencingToken:'0'}),/Fencing token/);
 assert.equal(pool.calls.length,0);
});

test('renew and settle require the current worker and fencing token',async()=>{
 const pool=fakePool([[],[{owner_id:base.ownerId,mission_id:base.missionId,task_id:base.taskId,claim_owner:'worker-a',idempotency_key:base.idempotencyKey,lease_expires_at:new Date(),fencing_token:'7',status:'completed'}]]);
 const store=createPostgresMissionCoordinationStore({pool});
 assert.equal(await store.renew({...base,fencingToken:'7'}),null);
 const settled=await store.settle({...base,fencingToken:'7',status:'completed'});
 assert.equal(settled.status,'completed');
 assert.match(pool.calls[0].sql,/claim_owner=\$4 AND fencing_token=\$5::BIGINT/);
 assert.match(pool.calls[1].sql,/lease_expires_at>NOW\(\)/);
});

test('rejects invalid identifiers, unstable idempotency keys, leases and terminal states before SQL',async()=>{
 const pool=fakePool();const store=createPostgresMissionCoordinationStore({pool});
 await assert.rejects(()=>store.claim({...base,ownerId:'raw-user'}),/Hashed owner/);
 await assert.rejects(()=>store.claim({...base,idempotencyKey:'short'}),/idempotency key/);
 await assert.rejects(()=>store.claim({...base,leaseMs:999}),/Lease duration/);
 await assert.rejects(()=>store.settle({...base,fencingToken:'1',status:'running'}),/terminal claim status/);
 assert.equal(pool.calls.length,0);
});
