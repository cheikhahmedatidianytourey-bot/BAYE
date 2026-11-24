import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createPostgresLifecycleEvidenceRecorder } from '../server/mission-task-lifecycle-evidence-pg.js';

const key = 'k'.repeat(32);
const timestamp = 1_700_000_000_000;
const payload = {
  ownerId: 'a'.repeat(64),
  missionId: 'mission_01',
  taskId: 'task_01',
  evidence: {
    replaySafe: true,
    checkpointValid: true,
    sideEffectsUncertain: false,
    recoveryAttempts: 1,
    maxRecoveryAttempts: 3
  }
};

function event(nonce = 'nonce_123456789012') {
  const envelope = { keyId: 'lifecycle_v1', timestamp, nonce };
  envelope.signature = createHmac('sha256', key)
    .update(Buffer.from(JSON.stringify({ timestamp, nonce, payload }), 'utf8'))
    .digest('hex');
  return { ...structuredClone(payload), authEnvelope: envelope };
}

function mockPool({ failEvidence = false } = {}) {
  const state = { calls: [], consumed: new Set(), evidence: [], rollbacks: 0, commits: 0, releases: 0 };
  return {
    state,
    async connect() {
      return {
        async query(sql, values = []) {
          state.calls.push({ sql, values });
          if (sql === 'BEGIN' || sql === 'COMMIT') {
            if (sql === 'COMMIT') state.commits++;
            return { rows: [] };
          }
          if (sql === 'ROLLBACK') {
            state.rollbacks++;
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO baye_lifecycle_nonces')) {
            const nonceKey = values.join(':');
            if (state.consumed.has(nonceKey)) return { rows: [] };
            state.consumed.add(nonceKey);
            return { rows: [{ consumed: 1 }] };
          }
          if (sql.includes('INSERT INTO baye_mission_task_recovery_evidence')) {
            if (failEvidence) throw new Error('evidence database unavailable');
            state.evidence.push(values);
            return { rows: [{ evidence_revision: '1' }] };
          }
          throw new Error('Unexpected SQL in test: ' + sql);
        },
        release() { state.releases++; }
      };
    }
  };
}

test('requires a connect-capable PostgreSQL pool and signing keys', () => {
  assert.throws(() => createPostgresLifecycleEvidenceRecorder(), /pool with connect/);
  assert.throws(() => createPostgresLifecycleEvidenceRecorder({ pool: { connect() {} } }), /signing-key map/);
});

test('valid signed event consumes nonce and writes evidence inside one transaction', async () => {
  const pool = mockPool();
  const recorder = createPostgresLifecycleEvidenceRecorder({
    pool, keys: { lifecycle_v1: key }, now: () => timestamp
  });
  const receipt = await recorder.record(event());
  assert.equal(receipt.evidenceRevision, '1');
  assert.equal(pool.state.commits, 1);
  assert.equal(pool.state.rollbacks, 0);
  assert.equal(pool.state.evidence.length, 1);
  assert.equal(pool.state.calls[0].sql, 'BEGIN');
  assert.equal(pool.state.calls.at(-1).sql, 'COMMIT');
  assert.equal(pool.state.releases, 1);
});

test('invalid signature is denied without consuming a nonce or writing evidence', async () => {
  const pool = mockPool();
  const recorder = createPostgresLifecycleEvidenceRecorder({
    pool, keys: { lifecycle_v1: key }, now: () => timestamp
  });
  const invalid = event();
  invalid.authEnvelope.signature = '0'.repeat(64);
  await assert.rejects(() => recorder.record(invalid), /authorization denied/);
  assert.equal(pool.state.consumed.size, 0);
  assert.equal(pool.state.evidence.length, 0);
  assert.equal(pool.state.rollbacks, 1);
  assert.equal(pool.state.commits, 0);
});

test('evidence write failure rolls back nonce consumption', async () => {
  const pool = mockPool({ failEvidence: true });
  const recorder = createPostgresLifecycleEvidenceRecorder({
    pool, keys: { lifecycle_v1: key }, now: () => timestamp
  });
  await assert.rejects(() => recorder.record(event()), /evidence database unavailable/);
  assert.equal(pool.state.consumed.size, 1);
  assert.equal(pool.state.rollbacks, 1);
  assert.equal(pool.state.commits, 0);
});
