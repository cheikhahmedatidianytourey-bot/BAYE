const OWNER=/^[a-f0-9]{64}$/;
const IDENTIFIER=/^[-a-zA-Z0-9_]{1,64}$/;
const WORKER=/^[-a-zA-Z0-9_.:]{1,128}$/;
const IDEMPOTENCY=/^[a-zA-Z0-9_.:-]{8,200}$/;

/**
 * Validates and normalizes the recovery envelope before policy evaluation.
 * Validation is not proof of provenance: callers must load values from trusted,
 * durable task metadata. Missing safety signals fail closed.
 */
export function validateMissionTaskRecoveryInput(input={}){
 const requiredBoolean=(key)=>{
  if(typeof input[key]!=='boolean') throw new TypeError(key+' must be explicitly boolean.');
  return input[key];
 };
 if(typeof input.status!=='string'||!input.status.trim())throw new TypeError('status is required.');
 const recoveryAttempts=input.recoveryAttempts;
 const maxRecoveryAttempts=input.maxRecoveryAttempts;
 if(!Number.isSafeInteger(recoveryAttempts)||recoveryAttempts<0)throw new TypeError('recoveryAttempts must be a non-negative integer.');
 if(!Number.isSafeInteger(maxRecoveryAttempts)||maxRecoveryAttempts<1||maxRecoveryAttempts>100)throw new TypeError('maxRecoveryAttempts must be between 1 and 100.');
 const check=(key,value,pattern,message)=>{if(typeof value!=='string'||!pattern.test(value))throw new TypeError(message);return value;};\n if(!Number.isSafeInteger(input.leaseMs)||input.leaseMs<1000||input.leaseMs>300000)throw new TypeError('leaseMs must be between 1000 and 300000.');
 return Object.freeze({
  status:input.status,
  leaseExpired:requiredBoolean('leaseExpired'),
  replaySafe:requiredBoolean('replaySafe'),
  checkpointValid:requiredBoolean('checkpointValid'),
  sideEffectsUncertain:requiredBoolean('sideEffectsUncertain'),
  recoveryAttempts,maxRecoveryAttempts,
  ownerId:check('ownerId',input.ownerId,OWNER,'Hashed owner namespace is invalid.'),
  missionId:check('missionId',input.missionId,IDENTIFIER,'Mission identifier is invalid.'),
  taskId:check('taskId',input.taskId,IDENTIFIER,'Task identifier is invalid.'),
  claimOwner:check('claimOwner',input.claimOwner,WORKER,'Claim owner is invalid.'),
  idempotencyKey:check('idempotencyKey',input.idempotencyKey,IDEMPOTENCY,'Stable idempotency key is invalid.'),
  leaseMs:input.leaseMs
 });
}
