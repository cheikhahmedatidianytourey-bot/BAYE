import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMissionTaskRecoveryInput } from '../server/mission-task-recovery-input-contract.js';

const valid={
 status:'running',leaseExpired:true,replaySafe:true,checkpointValid:true,
 sideEffectsUncertain:false,recoveryAttempts:0,maxRecoveryAttempts:3,
 ownerId:'a'.repeat(64),missionId:'mission_123',taskId:'task_1',
 claimOwner:'worker-1',idempotencyKey:'mission_123:task_1:v1',leaseMs:30000
};
test('normalizes valid explicit recovery envelope',()=>{
 const result=validateMissionTaskRecoveryInput(valid);
 assert.equal(result.status,'running');assert.equal(result.sideEffectsUncertain,false);
 assert.ok(Object.isFrozen(result));
});
test('fails closed when a safety boolean is missing',()=>{
 const input={...valid};delete input.sideEffectsUncertain;
 assert.throws(()=>validateMissionTaskRecoveryInput(input),/explicitly boolean/);
});
test('rejects malformed identity and budgets',()=>{
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,ownerId:'not-hashed'}),/namespace is invalid/);
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,maxRecoveryAttempts:101}),/between 1 and 100/);
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,recoveryAttempts:-1}),/non-negative integer/);
});
