const OWNER=/^[a-f0-9]{64}$/;
const IDENTIFIER=/^[-a-zA-Z0-9_]{1,64}$/;
const WORKER=/^[-a-zA-Z0-9_.:]{1,128}$/;
const IDEMPOTENCY=/^[a-zA-Z0-9_.:-]{8,200}$/;

/**
 * Validates only request identity and lease parameters.
 * Safety evidence is deliberately not accepted from the recovery requester;
 * it must be read independently from the durable evidence store.
 */
export function validateMissionTaskRecoveryInput(input={}){
 const check=(value,pattern,message)=>{if(typeof value!=='string'||!pattern.test(value))throw new TypeError(message);return value;};
 if(!Number.isSafeInteger(input.leaseMs)||input.leaseMs<1000||input.leaseMs>300000)throw new TypeError('leaseMs must be between 1000 and 300000.');
 return Object.freeze({
  ownerId:check(input.ownerId,OWNER,'Hashed owner namespace is invalid.'),
  missionId:check(input.missionId,IDENTIFIER,'Mission identifier is invalid.'),
  taskId:check(input.taskId,IDENTIFIER,'Task identifier is invalid.'),
  claimOwner:check(input.claimOwner,WORKER,'Claim owner is invalid.'),
  idempotencyKey:check(input.idempotencyKey,IDEMPOTENCY,'Stable idempotency key is invalid.'),
  leaseMs:input.leaseMs
 });
}
