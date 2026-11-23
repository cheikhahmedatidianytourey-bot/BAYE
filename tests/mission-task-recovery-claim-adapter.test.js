import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionTaskRecoveryClaimAdapter } from '../server/mission-task-recovery-claim-adapter.js';

const safe = {
  status:'running', leaseExpired:true, replaySafe:true, checkpointValid:true,
  sideEffectsUncertain:false, recoveryAttempts:0, maxRecoveryAttempts:3,
  ownerId:'a'.repeat(64), missionId:'mission_123456', taskId:'task_1',
  claimOwner:'recovery-worker', idempotencyKey:'mission_123456:task_1:v1', leaseMs:30000
};

test('rejects missing store',()=>assert.throws(()=>createMissionTaskRecoveryClaimAdapter(),/store with claim/));
test('policy rejection never calls store',async()=>{
 let calls=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:{async claim(){calls++;return {}}}});
 const result=await adapter.attemptRecovery({...safe,sideEffectsUncertain:true});
 assert.equal(result.decision,'needs_review');assert.equal(calls,0);
});
test('eligible policy delegates final claim to atomic store',async()=>{
 const claim={fencingToken:'9',claimOwner:'recovery-worker'};
 let input;const adapter=createMissionTaskRecoveryClaimAdapter({store:{async claim(i){input=i;return claim;}}});
 const result=await adapter.attemptRecovery(safe);
 assert.equal(result.decision,'claimed');assert.equal(result.claim,claim);assert.equal(input.taskId,safe.taskId);
});
test('atomic claim denial is reported without executing work',async()=>{
 const adapter=createMissionTaskRecoveryClaimAdapter({store:{async claim(){return null;}}});
 const result=await adapter.attemptRecovery(safe);
 assert.deepEqual(result,{decision:'claim_denied',reason:'atomic_claim_not_acquired',claim:null});
});
