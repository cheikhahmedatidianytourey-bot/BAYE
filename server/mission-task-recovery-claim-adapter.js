import { decideMissionTaskRecovery } from './mission-task-recovery-decision.js';
import { validateMissionTaskRecoveryInput } from './mission-task-recovery-input-contract.js';

/**
 * Recovery adapter derives claim status and lease expiry from the PostgreSQL
 * snapshot, then reclaims only that exact fencing generation with compare-and-swap.
 * Replay/checkpoint/side-effect evidence must still come from trusted durable data.
 * This adapter never executes recovered work.
 */
export function createMissionTaskRecoveryClaimAdapter({ store } = {}) {
  if (!store || typeof store.inspect !== 'function' || typeof store.reclaim !== 'function') {
    throw new TypeError('A coordination store with inspect() and reclaim() is required.');
  }

  return Object.freeze({
    async attemptRecovery(input = {}) {
      const normalized = validateMissionTaskRecoveryInput(input);
      const identity = {
        ownerId: normalized.ownerId,
        missionId: normalized.missionId,
        taskId: normalized.taskId
      };
      const snapshot = await store.inspect(identity);
      if (!snapshot) {
        return { decision: 'claim_denied', reason: 'claim_snapshot_missing', claim: null };
      }

      // Never trust caller-supplied status or lease expiry over the DB snapshot.
      const decision = decideMissionTaskRecovery({
        ...normalized,
        status: snapshot.status,
        leaseExpired: snapshot.leaseExpired
      });
      if (decision.decision !== 'eligible_for_reclaim') {
        return { ...decision, claim: null };
      }

      // The fencing token binds the atomic UPDATE to the exact inspected generation.
      const claim = await store.reclaim({
        ...identity,
        claimOwner: normalized.claimOwner,
        idempotencyKey: normalized.idempotencyKey,
        leaseMs: normalized.leaseMs,
        fencingToken: snapshot.fencingToken
      });
      return claim
        ? { decision: 'claimed', reason: 'snapshot_bound_atomic_reclaim', claim }
        : { decision: 'claim_denied', reason: 'snapshot_changed_or_reclaim_denied', claim: null };
    }
  });
}
