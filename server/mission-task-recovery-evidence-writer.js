const OWNER=/^[a-f0-9]{64}$/;
const IDENTIFIER=/^[-a-zA-Z0-9_]{1,64}$/;

/**
 * Lifecycle evidence writer. Authorization is supplied by the trusted host,
 * never by the recovery worker/request payload. This module does not execute tasks.
 */
export function createMissionTaskRecoveryEvidenceWriter({pool,authorizeLifecycleEvent}={}){
 if(!pool||typeof pool.query!=='function')throw new TypeError('A PostgreSQL-compatible pool is required.');
 if(typeof authorizeLifecycleEvent!=='function')throw new TypeError('A trusted lifecycle authorization function is required.');
 return Object.freeze({async recordEvidence(event={}){
  const {ownerId,missionId,taskId}=event;
  if(typeof ownerId!=='string'||!OWNER.test(ownerId))throw new TypeError('Hashed owner namespace is invalid.');
  if(typeof missionId!=='string'||!IDENTIFIER.test(missionId))throw new TypeError('Mission identifier is invalid.');
  if(typeof taskId!=='string'||!IDENTIFIER.test(taskId))throw new TypeError('Task identifier is invalid.');
  const evidence=event.evidence;
  if(!evidence||typeof evidence!=='object')throw new TypeError('Lifecycle evidence is required.');
  const {replaySafe,checkpointValid,sideEffectsUncertain,recoveryAttempts,maxRecoveryAttempts}=evidence;
  if(typeof replaySafe!=='boolean'||typeof checkpointValid!=='boolean'||typeof sideEffectsUncertain!=='boolean')throw new TypeError('Evidence safety flags must be boolean.');
  if(!Number.isSafeInteger(recoveryAttempts)||recoveryAttempts<0)throw new TypeError('Recovery attempts must be a non-negative integer.');
  if(!Number.isSafeInteger(maxRecoveryAttempts)||maxRecoveryAttempts<1||maxRecoveryAttempts>100)throw new TypeError('Recovery budget must be between 1 and 100.');
  if(recoveryAttempts>maxRecoveryAttempts)throw new TypeError('Recovery attempts cannot exceed the configured budget.');
  const authorized=await authorizeLifecycleEvent(event);
  if(authorized!==true)throw new Error('Lifecycle evidence writer authorization denied.');
  const result=await pool.query(`
   INSERT INTO baye_mission_task_recovery_evidence
    (owner_id,mission_id,task_id,replay_safe,checkpoint_valid,side_effects_uncertain,recovery_attempts,max_recovery_attempts,evidence_revision,updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,NOW())
   ON CONFLICT (owner_id,mission_id,task_id) DO UPDATE
    SET replay_safe=EXCLUDED.replay_safe,
        checkpoint_valid=EXCLUDED.checkpoint_valid,
        side_effects_uncertain=EXCLUDED.side_effects_uncertain,
        recovery_attempts=EXCLUDED.recovery_attempts,
        max_recovery_attempts=EXCLUDED.max_recovery_attempts,
        evidence_revision=baye_mission_task_recovery_evidence.evidence_revision+1,
        updated_at=NOW()
   RETURNING evidence_revision
  `,[ownerId,missionId,taskId,replaySafe,checkpointValid,sideEffectsUncertain,recoveryAttempts,maxRecoveryAttempts]);
  const row=result.rows?.[0];
  if(!row)throw new Error('Evidence persistence did not return a revision.');
  return Object.freeze({ownerId,missionId,taskId,evidenceRevision:String(row.evidence_revision)});
 }});
}
