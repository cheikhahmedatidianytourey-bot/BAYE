import { decideMissionTaskRecovery } from './mission-task-recovery-decision.js';
import { validateMissionTaskRecoveryInput } from './mission-task-recovery-input-contract.js';

/**
 * Recovery claim adapter. Input shape is validated before policy evaluation.
 * Values must still originate from trusted durable state; validation alone
 * cannot establish provenance. The atomic store claim is the final race guard.
 * This adapter does not execute recovered work.
 */
export function createMissionTaskRecoveryClaimAdapter({ store } = {}) {
  if (!store || typeof store.claim !== 'function') {
    throw new TypeError('A coordination store with claim() is required.');
  }

  return Object.freeze({
    async attemptRecovery(input = {}) {
      const normalized = validateMissionTaskRecoveryInput(input);
      const decision = decideMissionTaskRecovery(normalized);
      if (decision.decision !== 'eligible_for_reclaim') {
        return { ...decision, claim: null };
      }

      // The durable store rechecks eligibility atomically; this decision is not authority.
      const {
        ownerId, missionId, taskId, claimOwner, idempotencyKey, leaseMs
      } = normalized;
      const claim = await store.claim({
        ownerId, missionId, taskId, claimOwner, idempotencyKey, leaseMs
      });
      return claim
        ? { decision: 'claimed', reason: 'atomic_claim_acquired', claim }
        : { decision: 'claim_denied', reason: 'atomic_claim_not_acquired', claim: null };
    }
  });
}
