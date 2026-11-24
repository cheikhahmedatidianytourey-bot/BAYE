import test from 'node:test';
import assert from 'node:assert/strict';
import { decideMissionTaskRecovery } from '../server/mission-task-recovery-decision.js';

const base = { status: 'claimed', leaseExpired: true, replaySafe: true, checkpointValid: true, sideEffectsUncertain: false, recoveryAttempts: 0, maxRecoveryAttempts: 3 };

test('terminal tasks are never replayed', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, status: 'completed' }), { decision: 'do_not_replay', reason: 'terminal_state' });
});
test('persisted review state remains blocked', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, status: 'needs_review' }), { decision: 'needs_review', reason: 'persisted_review_state' });
});
test('unknown claim states fail closed', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, status: 'running' }), { decision: 'needs_review', reason: 'unknown_claim_state' });
});
test('active lease requires waiting', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, leaseExpired: false }), { decision: 'wait', reason: 'lease_active' });
});
test('uncertain side effects route to review', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, sideEffectsUncertain: true }), { decision: 'needs_review', reason: 'replay_safety_uncertain' });
});
test('unsafe replay contract routes to review', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, replaySafe: false }), { decision: 'needs_review', reason: 'replay_safety_uncertain' });
});
test('invalid checkpoint routes to review', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, checkpointValid: false }), { decision: 'needs_review', reason: 'checkpoint_invalid_or_missing' });
});
test('exhausted recovery budget routes to review', () => {
  assert.deepEqual(decideMissionTaskRecovery({ ...base, recoveryAttempts: 3 }), { decision: 'needs_review', reason: 'recovery_budget_exhausted' });
});
test('safe validated task is eligible for reclaim', () => {
  assert.deepEqual(decideMissionTaskRecovery(base), { decision: 'eligible_for_reclaim', reason: 'validated_recovery_conditions' });
});
test('rejects malformed inputs', () => {
  assert.throws(() => decideMissionTaskRecovery({ ...base, leaseExpired: 'yes' }), /must be boolean/);
  assert.throws(() => decideMissionTaskRecovery({ ...base, recoveryAttempts: -1 }), /non-negative integer/);
});
