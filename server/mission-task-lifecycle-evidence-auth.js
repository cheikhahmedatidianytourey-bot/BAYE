import { createHmac, timingSafeEqual } from 'node:crypto';

const OWNER=/^[a-f0-9]{64}$/;
const IDENTIFIER=/^[-a-zA-Z0-9_]{1,64}$/;
const NONCE=/^[a-zA-Z0-9_-]{16,128}$/;
const SIGNATURE=/^[a-f0-9]{64}$/;

function normalizePayload(event){
 const {ownerId,missionId,taskId,evidence}=event??{};
 if(typeof ownerId!=='string'||!OWNER.test(ownerId))return null;
 if(typeof missionId!=='string'||!IDENTIFIER.test(missionId))return null;
 if(typeof taskId!=='string'||!IDENTIFIER.test(taskId))return null;
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))return null;
 const {replaySafe,checkpointValid,sideEffectsUncertain,recoveryAttempts,maxRecoveryAttempts}=evidence;
 if(typeof replaySafe!=='boolean'||typeof checkpointValid!=='boolean'||typeof sideEffectsUncertain!=='boolean')return null;
 if(!Number.isSafeInteger(recoveryAttempts)||recoveryAttempts<0)return null;
 if(!Number.isSafeInteger(maxRecoveryAttempts)||maxRecoveryAttempts<1||maxRecoveryAttempts>100||recoveryAttempts>maxRecoveryAttempts)return null;
 return {ownerId,missionId,taskId,evidence:{replaySafe,checkpointValid,sideEffectsUncertain,recoveryAttempts,maxRecoveryAttempts}};
}
function safeEqualHex(left,right){
 if(!SIGNATURE.test(left)||!SIGNATURE.test(right))return false;
 return timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
}
/** Creates the authorization callback expected by the v6.0 evidence writer. */
export function createSignedLifecycleEvidenceAuthorizer({keys,nonceStore,now=()=>Date.now(),maxAgeMs=30000}={}){
 if(!keys||typeof keys!=='object'||Array.isArray(keys))throw new TypeError('A lifecycle signing-key map is required.');
 if(!nonceStore||typeof nonceStore.consume!=='function')throw new TypeError('An atomic lifecycle nonce store is required.');
 if(typeof now!=='function')throw new TypeError('A clock function is required.');
 if(!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1000||maxAgeMs>300000)throw new TypeError('maxAgeMs must be between 1000 and 300000.');
 return async function authorizeLifecycleEvidence(event){
  const envelope=event?.authEnvelope;
  const payload=normalizePayload(event);
  if(!payload||!envelope||typeof envelope!=='object')return false;
  const {keyId,timestamp,nonce,signature}=envelope;
  if(typeof keyId!=='string'||!IDENTIFIER.test(keyId)||typeof keys[keyId]!=='string'||Buffer.byteLength(keys[keyId])<32)return false;
  if(!Number.isSafeInteger(timestamp)||typeof nonce!=='string'||!NONCE.test(nonce)||typeof signature!=='string'||!SIGNATURE.test(signature))return false;
  const current=now();
  if(!Number.isSafeInteger(current)||Math.abs(current-timestamp)>maxAgeMs)return false;
  const signedBytes=Buffer.from(JSON.stringify({timestamp,nonce,payload}),'utf8');
  const expected=createHmac('sha256',keys[keyId]).update(signedBytes).digest('hex');
  if(!safeEqualHex(signature,expected))return false;
  try{return await nonceStore.consume({keyId,nonce,expiresAt:timestamp+maxAgeMs})===true;}
  catch{return false;}
 };
}
