import { decideMissionTaskRecovery } from './mission-task-recovery-decision.js';

/**
 * Recovery claim adapter. Policy inputs must be read from trusted durable state.
 * The coordination store's atomic claim remains the final race/fencing guard.
 * This adapter does not execute the recovered task.
 */
export function createMissionTaskRecoveryClaimAdapter({ store } = {}) {
  if (!store || typeof store.claim !== 'function') {
    throw new TypeError('A coordination store with claim() is required.');
  }

  return Object.freeze({
    async attemptRecovery(input = {}) {
      const {
        status, leaseExpired, replaySafe, checkpointValid,
        sideEffectsUncertain = true, recoveryAttempts = 0,
        maxRecoveryAttempts = 3, ownerId, missionId, taskId,
        claimOwner, idempotencyKey, leaseMs
      } = input;

      const decision = decideMissionTaskRecovery({
        status, leaseExpired, replaySafe, checkpointValid,
        sideEffectsUncertain, recoveryAttempts, maxRecoveryAttempts
      });
      if (decision.decision !== 'eligible_for_reclaim') {
        return { ...decision, claim: null };
      }

      // The durable store rechecks eligibility atomically; this decision is not authority.
      const claim = await store.claim({
        ownerId, missionId, taskId, claimOwner, idempotencyKey, leaseMs
      });
      return claim
        ? { decision: 'claimed', reason: 'atomic_claim_acquired', claim }
        : { decision: 'claim_denied', reason: 'atomic_claim_not_acquired', claim: null };
    }
  });
}
