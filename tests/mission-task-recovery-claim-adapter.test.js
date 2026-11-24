import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionTaskRecoveryClaimAdapter } from '../server/mission-task-recovery-claim-adapter.js';

const request = {
 ownerId:'a'.repeat(64),missionId:'mission_123456',taskId:'task_1',
 claimOwner:'recovery-worker',idempotencyKey:'mission_123456:task_1:v1',leaseMs:30000,
 // Deliberately hostile/stale fields: none may influence policy.
 status:'completed',leaseExpired:true,replaySafe:false,checkpointValid:false,
 sideEffectsUncertain:true,recoveryAttempts:99,maxRecoveryAttempts:1
};
const snapshot={status:'claimed',leaseExpired:true,fencingToken:'7'};
const evidence={replaySafe:true,checkpointValid:true,sideEffectsUncertain:false,recoveryAttempts:0,maxRecoveryAttempts:3,evidenceRevision:'4'};
const makeStore=({snap=snapshot,proof=evidence,reclaim=async()=>({fencingToken:'8'})}={})=>({
 async inspect(){return snap;},async inspectRecoveryEvidence(){return proof;},reclaim
});

test('requires snapshot, durable evidence reader and atomic reclaim',()=>{
 assert.throws(()=>createMissionTaskRecoveryClaimAdapter(),/inspect\(\).*inspectRecoveryEvidence/);
 assert.throws(()=>createMissionTaskRecoveryClaimAdapter({store:{claim:async()=>({})}}),/inspect\(\).*inspectRecoveryEvidence/);
});
test('invalid identity or lease is rejected before storage access',async()=>{
 let calls=0;const store={async inspect(){calls++;},async inspectRecoveryEvidence(){calls++;},async reclaim(){calls++;}};
 const adapter=createMissionTaskRecoveryClaimAdapter({store});
 await assert.rejects(()=>adapter.attemptRecovery({...request,leaseMs:0}),/leaseMs/);
 await assert.rejects(()=>adapter.attemptRecovery({...request,ownerId:'raw'}),/owner namespace/);
 assert.equal(calls,0);
});
test('missing coordination snapshot denies recovery',async()=>{
 const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({snap:null})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'claim_denied',reason:'claim_snapshot_missing',claim:null});
});
test('missing durable evidence fails closed without reclaim',async()=>{
 let reclaims=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({proof:null,reclaim:async()=>{reclaims++;}})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'needs_review',reason:'recovery_evidence_missing',claim:null});
 assert.equal(reclaims,0);
});
test('invalid durable evidence fails closed',async()=>{
 let reclaims=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({proof:{...evidence,replaySafe:'true'},reclaim:async()=>{reclaims++;}})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'needs_review',reason:'recovery_evidence_invalid',claim:null});
 assert.equal(reclaims,0);
});
test('requester-supplied safety fields are ignored in favor of durable evidence',async()=>{
 let input;const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({reclaim:async value=>(input=value,{fencingToken:'8'})})});
 const result=await adapter.attemptRecovery(request);
 assert.equal(result.decision,'claimed');
 assert.equal(input.fencingToken,'7');
 assert.equal(input.taskId,request.taskId);
});
test('persisted active lease blocks recovery even with safe durable evidence',async()=>{
 const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({snap:{...snapshot,leaseExpired:false}})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'wait',reason:'lease_active',claim:null});
});
test('durable needs-review evidence blocks reclaim',async()=>{
 let reclaims=0;const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({proof:{...evidence,sideEffectsUncertain:true},reclaim:async()=>{reclaims++;}})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'needs_review',reason:'replay_safety_uncertain',claim:null});
 assert.equal(reclaims,0);
});
test('lost compare-and-swap race is reported as denial',async()=>{
 const adapter=createMissionTaskRecoveryClaimAdapter({store:makeStore({reclaim:async()=>null})});
 assert.deepEqual(await adapter.attemptRecovery(request),{decision:'claim_denied',reason:'snapshot_changed_or_reclaim_denied',claim:null});
});
