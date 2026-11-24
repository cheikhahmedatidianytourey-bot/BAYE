import { createSignedLifecycleEvidenceAuthorizer } from './mission-task-lifecycle-evidence-auth.js';
import { createMissionTaskRecoveryEvidenceWriter } from './mission-task-recovery-evidence-writer.js';
import { createPostgresLifecycleNonceStore } from './mission-task-lifecycle-nonce-store-pg.js';

/**
 * Persist a signed lifecycle event and its single-use nonce in one PostgreSQL
 * transaction. The caller supplies a trusted Pool and host-managed signing keys.
 *
 * This adapter records evidence only; it does not authenticate HTTP callers,
 * establish that observations are true, execute tasks, or start recovery.
 */
export function createPostgresLifecycleEvidenceRecorder({
  pool,
  keys,
  now = () => Date.now(),
  maxAgeMs = 30_000
} = {}) {
  if (!pool || typeof pool.connect !== 'function') {
    throw new TypeError('A PostgreSQL pool with connect() is required.');
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys) || Object.keys(keys).length === 0) {
    throw new TypeError('A lifecycle signing-key map is required.');
  }
  if (typeof now !== 'function') throw new TypeError('A clock function is required.');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1_000 || maxAgeMs > 300_000) {
    throw new TypeError('maxAgeMs must be between 1000 and 300000.');
  }

  return Object.freeze({
    async record(event) {
      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query('BEGIN');
        transactionOpen = true;

        const nonceStore = createPostgresLifecycleNonceStore({ pool: client });
        const authorizeLifecycleEvent = createSignedLifecycleEvidenceAuthorizer({
          keys,
          nonceStore,
          now,
          maxAgeMs
        });
        const writer = createMissionTaskRecoveryEvidenceWriter({
          pool: client,
          authorizeLifecycleEvent
        });

        const receipt = await writer.recordEvidence(event);
        await client.query('COMMIT');
        transactionOpen = false;
        return receipt;
      } catch (error) {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Preserve the original failure. A broken connection cannot be
            // treated as a successful commit or as a confirmed rollback.
          }
        }
        throw error;
      } finally {
        client.release();
      }
    }
  });
}
