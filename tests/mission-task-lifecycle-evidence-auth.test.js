import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createSignedLifecycleEvidenceAuthorizer } from '../server/mission-task-lifecycle-evidence-auth.js';

const key='k'.repeat(32);
const payload={ownerId:'a'.repeat(64),missionId:'mission_01',taskId:'task_01',evidence:{replaySafe:true,checkpointValid:true,sideEffectsUncertain:false,recoveryAttempts:1,maxRecoveryAttempts:3}};
function makeEvent({timestamp=100000,nonce='nonce_123456789012',secret=key}={}){
 const envelope={keyId:'lifecycle_v1',timestamp,nonce};
 envelope.signature=createHmac('sha256',secret).update(Buffer.from(JSON.stringify({timestamp,nonce,payload}),'utf8')).digest('hex');
 return {...structuredClone(payload),authEnvelope:envelope};
}
function setup({consume=async()=>true,clock=()=>100000}={}){
 const calls=[];
 const authorize=createSignedLifecycleEvidenceAuthorizer({keys:{lifecycle_v1:key},nonceStore:{async consume(value){calls.push(value);return consume(value);}},now:clock});
 return {authorize,calls};
}
test('accepts valid signed lifecycle event and consumes nonce',async()=>{
 const {authorize,calls}=setup(); assert.equal(await authorize(makeEvent()),true); assert.equal(calls.length,1);
});
test('rejects invalid signature without consuming nonce',async()=>{
 const {authorize,calls}=setup(); const event=makeEvent(); event.authEnvelope.signature='0'.repeat(64);
 assert.equal(await authorize(event),false); assert.equal(calls.length,0);
});
test('rejects expired and future-dated envelopes',async()=>{
 const {authorize,calls}=setup(); assert.equal(await authorize(makeEvent({timestamp:60000})),false);
 assert.equal(await authorize(makeEvent({timestamp:140001})),false); assert.equal(calls.length,0);
});
test('rejects replay when nonce store reports existing nonce',async()=>{
 const {authorize}=setup({consume:async()=>false}); assert.equal(await authorize(makeEvent()),false);
});
test('rejects altered evidence because signature binds exact payload',async()=>{
 const {authorize,calls}=setup(); const event=makeEvent(); event.evidence.replaySafe=false;
 assert.equal(await authorize(event),false); assert.equal(calls.length,0);
});
test('fails closed when nonce storage is unavailable',async()=>{
 const {authorize}=setup({consume:async()=>{throw new Error('storage unavailable');}});
 assert.equal(await authorize(makeEvent()),false);
});
test('requires key map and nonce store',()=>{
 assert.throws(()=>createSignedLifecycleEvidenceAuthorizer({keys:{},nonceStore:{consume(){}}}),/signing-key map/);
 assert.throws(()=>createSignedLifecycleEvidenceAuthorizer({keys:{lifecycle_v1:key}}),/atomic lifecycle nonce store/);
});
