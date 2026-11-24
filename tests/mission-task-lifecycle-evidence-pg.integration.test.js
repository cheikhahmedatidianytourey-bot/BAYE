import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPostgresLifecycleEvidenceRecorder } from '../server/mission-task-lifecycle-evidence-pg.js';

const databaseUrl = process.env.BAYE_TEST_DATABASE_URL;
const nonceMigration = new URL('../migrations/0063_lifecycle_nonce_store.sql', import.meta.url);
const key = 'integration-signing-key-material-32-bytes';
const timestamp = 1_700_000_000_000;
const payload = {
  ownerId: 'b'.repeat(64),
  missionId: 'integration_mission',
  taskId: 'integration_task',
  evidence: {
    replaySafe: true,
    checkpointValid: true,
    sideEffectsUncertain: false,
    recoveryAttempts: 0,
    maxRecoveryAttempts: 3
  }
};

function signedEvent(nonce) {
  const authEnvelope = { keyId: 'integration_key', timestamp, nonce };
  authEnvelope.signature = createHmac('sha256', key)
    .update(Buffer.from(JSON.stringify({ timestamp, nonce, payload }), 'utf8'))
    .digest('hex');
  return { ...structuredClone(payload), authEnvelope };
}

test('PostgreSQL lifecycle recorder atomically binds HMAC nonce and durable evidence', {
  skip: !databaseUrl ? 'BAYE_TEST_DATABASE_URL is not configured' : false
}, async (t) => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
    'Integration tests are restricted to a local disposable PostgreSQL server.');
  assert.match(databaseName, /(^|[_-])test($|[_-])/i,
    'Database name must clearly identify a test database.');

  const schema = `baye_lifecycle_atomic_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 3 });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      max: 8
    });
    await pool.query(await readFile(nonceMigration, 'utf8'));
    const createEvidenceTable = async () => pool.query(`
      CREATE TABLE baye_mission_task_recovery_evidence (
        owner_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        replay_safe BOOLEAN NOT NULL,
        checkpoint_valid BOOLEAN NOT NULL,
        side_effects_uncertain BOOLEAN NOT NULL,
        recovery_attempts INTEGER NOT NULL,
        max_recovery_attempts INTEGER NOT NULL,
        evidence_revision BIGINT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (owner_id, mission_id, task_id)
      )
    `);
    await createEvidenceTable();

    const recorder = createPostgresLifecycleEvidenceRecorder({
      pool,
      keys: { integration_key: key },
      now: () => timestamp
    });

    await t.test('valid signed event persists nonce and evidence together', async () => {
      const receipt = await recorder.record(signedEvent('atomic-valid-0000001'));
      assert.equal(receipt.evidenceRevision, '1');
      const nonce = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE nonce = $1',
        ['atomic-valid-0000001']
      );
      const evidence = await pool.query(
        'SELECT count(*)::int AS count FROM baye_mission_task_recovery_evidence WHERE task_id = $1',
        [payload.taskId]
      );
      assert.equal(nonce.rows[0].count, 1);
      assert.equal(evidence.rows[0].count, 1);
    });

    await t.test('replayed signed event is rejected without another evidence revision', async () => {
      await assert.rejects(
        () => recorder.record(signedEvent('atomic-valid-0000001')),
        /authorization denied/
      );
      const evidence = await pool.query(
        'SELECT evidence_revision FROM baye_mission_task_recovery_evidence WHERE task_id = $1',
        [payload.taskId]
      );
      assert.equal(evidence.rows[0].evidence_revision, '1');
    });

    await t.test('evidence persistence failure rolls back nonce so exact event can be retried', async () => {
      const retryEvent = signedEvent('atomic-retry-00000001');
      await pool.query('DROP TABLE baye_mission_task_recovery_evidence');
      await assert.rejects(() => recorder.record(retryEvent), /does not exist/);
      const nonceAfterFailure = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE nonce = $1',
        ['atomic-retry-00000001']
      );
      assert.equal(nonceAfterFailure.rows[0].count, 0);

      await createEvidenceTable();
      const receipt = await recorder.record(retryEvent);
      assert.equal(receipt.evidenceRevision, '1');
      const nonceAfterRetry = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE nonce = $1',
        ['atomic-retry-00000001']
      );
      assert.equal(nonceAfterRetry.rows[0].count, 1);
    });

    await t.test('concurrent identical envelopes produce exactly one durable event', async () => {
      const concurrentEvent = signedEvent('atomic-race-00000001');
      const attempts = await Promise.allSettled([
        recorder.record(concurrentEvent),
        recorder.record(concurrentEvent)
      ]);
      assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
      assert.equal(attempts.filter((item) => item.status === 'rejected').length, 1);
      const nonce = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE nonce = $1',
        ['atomic-race-00000001']
      );
      assert.equal(nonce.rows[0].count, 1);
    });
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
