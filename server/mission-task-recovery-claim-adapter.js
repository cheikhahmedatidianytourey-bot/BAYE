import { decideMissionTaskRecovery } from './mission-task-recovery-decision.js';
import { validateMissionTaskRecoveryInput } from './mission-task-recovery-input-contract.js';

/**
 * Recovery derives lease state and safety evidence from durable stores.
 * Requester-provided policy evidence is ignored. The adapter never executes work.
 */
export function createMissionTaskRecoveryClaimAdapter({ store } = {}) {
  if (!store || typeof store.inspect !== 'function' ||
      typeof store.inspectRecoveryEvidence !== 'function' ||
      typeof store.reclaim !== 'function') {
    throw new TypeError('A coordination store with inspect(), inspectRecoveryEvidence() and reclaim() is required.');
  }

  return Object.freeze({
    async attemptRecovery(input = {}) {
      const normalized = validateMissionTaskRecoveryInput(input);
      const identity = { ownerId: normalized.ownerId, missionId: normalized.missionId, taskId: normalized.taskId };
      const snapshot = await store.inspect(identity);
      if (!snapshot) return { decision: 'claim_denied', reason: 'claim_snapshot_missing', claim: null };

      const evidence = await store.inspectRecoveryEvidence(identity);
      if (!evidence) return { decision: 'needs_review', reason: 'recovery_evidence_missing', claim: null };
      const evidenceFields = {
        replaySafe: evidence.replaySafe,
        checkpointValid: evidence.checkpointValid,
        sideEffectsUncertain: evidence.sideEffectsUncertain,
        recoveryAttempts: evidence.recoveryAttempts,
        maxRecoveryAttempts: evidence.maxRecoveryAttempts
      };
      if (typeof evidenceFields.replaySafe !== 'boolean' ||
          typeof evidenceFields.checkpointValid !== 'boolean' ||
          typeof evidenceFields.sideEffectsUncertain !== 'boolean' ||
          !Number.isSafeInteger(evidenceFields.recoveryAttempts) || evidenceFields.recoveryAttempts < 0 ||
          !Number.isSafeInteger(evidenceFields.maxRecoveryAttempts) ||
          evidenceFields.maxRecoveryAttempts < 1 || evidenceFields.maxRecoveryAttempts > 100 ||
          !/^[1-9][0-9]{0,18}$/.test(String(evidence.evidenceRevision ?? ''))) {
        return { decision: 'needs_review', reason: 'recovery_evidence_invalid', claim: null };
      }

      const decision = decideMissionTaskRecovery({
        status: snapshot.status,
        leaseExpired: snapshot.leaseExpired,
        ...evidenceFields
      });
      if (decision.decision !== 'eligible_for_reclaim') return { ...decision, claim: null };

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
