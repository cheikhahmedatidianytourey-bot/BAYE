/**
 * Pure, conservative recovery decision helper.
 * Inputs must be derived from durable state; this module performs no I/O.
 */
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function decideMissionTaskRecovery({
  status,
  leaseExpired,
  replaySafe,
  checkpointValid,
  sideEffectsUncertain = true,
  recoveryAttempts = 0,
  maxRecoveryAttempts = 3,
} = {}) {
  if (typeof status !== 'string' || !status) throw new TypeError('status is required.');
  for (const [name, value] of Object.entries({ leaseExpired, replaySafe, checkpointValid, sideEffectsUncertain })) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean.');
  }
  if (!Number.isSafeInteger(recoveryAttempts) || recoveryAttempts < 0) throw new TypeError('recoveryAttempts must be a non-negative integer.');
  if (!Number.isSafeInteger(maxRecoveryAttempts) || maxRecoveryAttempts < 1) throw new TypeError('maxRecoveryAttempts must be a positive integer.');

  if (TERMINAL.has(status)) return { decision: 'do_not_replay', reason: 'terminal_state' };
  if (status === 'needs_review') return { decision: 'needs_review', reason: 'persisted_review_state' };
  if (!['claimed', 'retryable', 'released'].includes(status)) {
    return { decision: 'needs_review', reason: 'unknown_claim_state' };
  }
  if (!leaseExpired) return { decision: 'wait', reason: 'lease_active' };
  if (!replaySafe || sideEffectsUncertain) return { decision: 'needs_review', reason: 'replay_safety_uncertain' };
  if (!checkpointValid) return { decision: 'needs_review', reason: 'checkpoint_invalid_or_missing' };
  if (recoveryAttempts >= maxRecoveryAttempts) return { decision: 'needs_review', reason: 'recovery_budget_exhausted' };
  return { decision: 'eligible_for_reclaim', reason: 'validated_recovery_conditions' };
}
