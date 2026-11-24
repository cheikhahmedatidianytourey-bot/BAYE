import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMissionTaskRecoveryInput } from '../server/mission-task-recovery-input-contract.js';

const valid={
 ownerId:'a'.repeat(64),missionId:'mission_123',taskId:'task_1',
 claimOwner:'worker-1',idempotencyKey:'mission_123:task_1:v1',leaseMs:30000,
 status:'completed',leaseExpired:false,replaySafe:false,checkpointValid:false,
 sideEffectsUncertain:true,recoveryAttempts:99,maxRecoveryAttempts:1
};
test('normalizes only request identity and lease envelope',()=>{
 const result=validateMissionTaskRecoveryInput(valid);
 assert.deepEqual(result,{ownerId:valid.ownerId,missionId:valid.missionId,taskId:valid.taskId,claimOwner:valid.claimOwner,idempotencyKey:valid.idempotencyKey,leaseMs:valid.leaseMs});
 assert.ok(Object.isFrozen(result));
});
test('caller-supplied safety and state fields are not normalized or trusted',()=>{
 const result=validateMissionTaskRecoveryInput(valid);
 for(const key of ['status','leaseExpired','replaySafe','checkpointValid','sideEffectsUncertain','recoveryAttempts','maxRecoveryAttempts'])assert.equal(Object.hasOwn(result,key),false);
});
test('rejects malformed identity and lease',()=>{
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,ownerId:'not-hashed'}),/namespace is invalid/);
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,leaseMs:0}),/leaseMs/);
 assert.throws(()=>validateMissionTaskRecoveryInput({...valid,missionId:'bad id'}),/Mission identifier/);
});
