import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresLifecycleNonceStore } from '../server/mission-task-lifecycle-nonce-store-pg.js';

test('inserts nonce with bound parameters and returns consumed status', async () => {
  let captured;
  const store = createPostgresLifecycleNonceStore({ pool: { async query(sql, params) {
    captured = { sql, params }; return { rows: [{ key_id: 'k1' }] };
  } } });
  assert.equal(await store.consume({ keyId: 'k1', nonce: 'nonce', expiresAt: 123456 }), true);
  assert.match(captured.sql, /ON CONFLICT \(key_id, nonce\) DO NOTHING RETURNING/);
  assert.deepEqual(captured.params, ['k1', 'nonce', 123456]);
});

test('returns false when nonce conflicts (replay)', async () => {
  const store = createPostgresLifecycleNonceStore({ pool: { async query() { return { rows: [] }; } } });
  assert.equal(await store.consume({ keyId: 'k1', nonce: 'nonce', expiresAt: 123456 }), false);
});

test('rejects invalid input without database call', async () => {
  let calls = 0;
  const store = createPostgresLifecycleNonceStore({ pool: { async query() { calls++; return { rows: [] }; } } });
  assert.equal(await store.consume({ keyId: '', nonce: 'nonce', expiresAt: 123456 }), false);
  assert.equal(calls, 0);
});

test('requires query-capable pool', () => {
  assert.throws(() => createPostgresLifecycleNonceStore(), /query-capable pool/);
});
