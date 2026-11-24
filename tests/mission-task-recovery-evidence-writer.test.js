import test from 'node:test';
import assert from 'node:assert/strict';
import {createMissionTaskRecoveryEvidenceWriter} from '../server/mission-task-recovery-evidence-writer.js';

const event={ownerId:'a'.repeat(64),missionId:'mission_123456',taskId:'task_1',evidence:{replaySafe:true,checkpointValid:true,sideEffectsUncertain:false,recoveryAttempts:0,maxRecoveryAttempts:3}};
function pool(rows=[{evidence_revision:'1'}]){const calls=[];return {calls,async query(sql,values){calls.push({sql,values});return {rows};}};}

test('requires pool and trusted authorization provider',()=>{
 assert.throws(()=>createMissionTaskRecoveryEvidenceWriter(),/pool/);
 assert.throws(()=>createMissionTaskRecoveryEvidenceWriter({pool:{query:async()=>({rows:[]})}}),/authorization function/);
});
test('denied lifecycle authorization prevents SQL writes',async()=>{
 const p=pool();const w=createMissionTaskRecoveryEvidenceWriter({pool:p,authorizeLifecycleEvent:()=>false});
 await assert.rejects(()=>w.recordEvidence(event),/authorization denied/);assert.equal(p.calls.length,0);
});
test('valid authorized lifecycle event writes evidence with revision increment on conflict',async()=>{
 const p=pool([{evidence_revision:'4'}]);const w=createMissionTaskRecoveryEvidenceWriter({pool:p,authorizeLifecycleEvent:()=>true});
 assert.deepEqual(await w.recordEvidence(event),{ownerId:event.ownerId,missionId:event.missionId,taskId:event.taskId,evidenceRevision:'4'});
 assert.match(p.calls[0].sql,/ON CONFLICT \(owner_id,mission_id,task_id\) DO UPDATE/);
 assert.match(p.calls[0].sql,/evidence_revision=baye_mission_task_recovery_evidence\.evidence_revision\+1/);
 assert.equal(p.calls[0].values[3],true);
});
test('validates safety evidence before authorization or persistence',async()=>{
 const p=pool();let auth=0;const w=createMissionTaskRecoveryEvidenceWriter({pool:p,authorizeLifecycleEvent:()=>{auth++;return true;}});
 await assert.rejects(()=>w.recordEvidence({...event,evidence:{...event.evidence,replaySafe:'yes'}}),/flags must be boolean/);
 await assert.rejects(()=>w.recordEvidence({...event,evidence:{...event.evidence,maxRecoveryAttempts:101}}),/budget/);
 await assert.rejects(()=>w.recordEvidence({...event,evidence:{...event.evidence,recoveryAttempts:4}}),/exceed/);
 assert.equal(auth,0);assert.equal(p.calls.length,0);
});
test('rejects malformed identity',async()=>{
 const w=createMissionTaskRecoveryEvidenceWriter({pool:pool(),authorizeLifecycleEvent:()=>true});
 await assert.rejects(()=>w.recordEvidence({...event,ownerId:'raw'}),/namespace/);
});
