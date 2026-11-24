import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionTaskRecoveryClaimAdapter } from '../server/mission-task-recovery-claim-adapter.js';

const safe = {
  status:'running', leaseExpired:false, replaySafe:true, checkpointValid:true,
  sideEffectsUncertain:false, recoveryAttempts:0, maxRecoveryAttempts:3,
  ownerId:'a'.repeat(64), missionId:'mission_123456', taskId:'task_1',
  claimOwner:'recovery-worker', idempotencyKey:'mission_123456:task_1:v1', leaseMs:30000
};
const snapshot={status:'claimed',leaseExpired:true,fencingToken:'7',idempotencyKey:safe.idempotencyKey};

test('requires inspect and atomic reclaim methods',()=>{
 assert.throws(()=>createMissionTaskRecoveryClaimAdapter(),/inspect\(\) and reclaim\(\)/);
 assert.throws(()=>createMissionTaskRecoveryClaimAdapter({store:{claim:async()=>({})}}),/inspect\(\) and reclaim\(\)/);
});
test('invalid input fails closed before store access',async()=>{
 let calls=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:{async inspect(){calls++;return snapshot;},async reclaim(){calls++;return {};}}});
 await assert.rejects(()=>adapter.attemptRecovery({...safe,sideEffectsUncertain:undefined}),/explicitly boolean/);
 await assert.rejects(()=>adapter.attemptRecovery({...safe,leaseMs:0}),/leaseMs/);
 assert.equal(calls,0);
});
test('missing durable snapshot denies recovery',async()=>{
 let reclaims=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:{async inspect(){return null;},async reclaim(){reclaims++;}}});
 const result=await adapter.attemptRecovery(safe);
 assert.deepEqual(result,{decision:'claim_denied',reason:'claim_snapshot_missing',claim:null});
 assert.equal(reclaims,0);
});
test('database status and lease expiry override caller-supplied values',async()=>{
 let reclaimInput;const adapter=createMissionTaskRecoveryClaimAdapter({store:{
  async inspect(){return {...snapshot,status:'claimed',leaseExpired:false};},
  async reclaim(input){reclaimInput=input;return {fencingToken:'8'};}
 }});
 const result=await adapter.attemptRecovery({...safe,status:'completed',leaseExpired:true});
 assert.deepEqual(result,{decision:'wait',reason:'lease_active',claim:null});
 assert.equal(reclaimInput,undefined);
});
test('persisted needs_review state can never be reclaimed',async()=>{
 let reclaims=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:{
  async inspect(){return {...snapshot,status:'needs_review'};},
  async reclaim(){reclaims++;return {};}
 }});
 const result=await adapter.attemptRecovery(safe);
 assert.deepEqual(result,{decision:'needs_review',reason:'persisted_review_state',claim:null});
 assert.equal(reclaims,0);
});
test('eligible snapshot delegates its exact fencing generation to atomic reclaim',async()=>{
 const claim={fencingToken:'8',claimOwner:'recovery-worker'};
 let input;const adapter=createMissionTaskRecoveryClaimAdapter({store:{
  async inspect(){return snapshot;},
  async reclaim(i){input=i;return claim;}
 }});
 const result=await adapter.attemptRecovery(safe);
 assert.equal(result.decision,'claimed');assert.equal(result.claim,claim);
 assert.equal(input.taskId,safe.taskId);assert.equal(input.fencingToken,'7');
 assert.equal(input.leaseMs,safe.leaseMs);
});
test('lost compare-and-swap race is reported as a denial',async()=>{
 const adapter=createMissionTaskRecoveryClaimAdapter({store:{
  async inspect(){return snapshot;},async reclaim(){return null;}
 }});
 const result=await adapter.attemptRecovery(safe);
 assert.deepEqual(result,{decision:'claim_denied',reason:'snapshot_changed_or_reclaim_denied',claim:null});
});
