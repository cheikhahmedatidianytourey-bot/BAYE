import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPostgresLifecycleNonceStore } from '../server/mission-task-lifecycle-nonce-store-pg.js';

const databaseUrl = process.env.BAYE_TEST_DATABASE_URL;
const migrationUrl = new URL('../migrations/0063_lifecycle_nonce_store.sql', import.meta.url);

test('PostgreSQL nonce store: atomic concurrency, durability, and fail-closed errors', {
  skip: !databaseUrl ? 'BAYE_TEST_DATABASE_URL is not configured' : false
}, async (t) => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
    'Integration tests are restricted to a local disposable PostgreSQL server.');
  assert.match(databaseName, /(^|[_-])test($|[_-])/i,
    'Database name must clearly identify a test database.');

  const schema = `baye_nonce_test_${randomUUID().replaceAll('-', '')}`;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
  let pool;

  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const openScopedPool = () => new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      max: 8
    });
    const applyMigration = async (targetPool) => {
      await targetPool.query(await readFile(migrationUrl, 'utf8'));
    };

    pool = openScopedPool();
    await applyMigration(pool);

    await t.test('only one of 32 concurrent attempts consumes a nonce', async () => {
      const store = createPostgresLifecycleNonceStore({ pool });
      const attempts = await Promise.all(Array.from({ length: 32 }, () =>
        store.consume({ keyId: 'integration-key', nonce: 'same-nonce', expiresAt: Date.now() + 60_000 })
      ));
      assert.equal(attempts.filter(Boolean).length, 1);
      assert.equal(attempts.filter((value) => value === false).length, 31);
      assert.equal(await store.consume({
        keyId: 'integration-key', nonce: 'different-nonce', expiresAt: Date.now() + 60_000
      }), true);
    });

    await t.test('nonce replay remains rejected after reconnecting', async () => {
      const nonce = 'durable-across-pools';
      const firstStore = createPostgresLifecycleNonceStore({ pool });
      assert.equal(await firstStore.consume({
        keyId: 'integration-key', nonce, expiresAt: Date.now() + 60_000
      }), true);

      await pool.end();
      pool = openScopedPool();
      const reconnectedStore = createPostgresLifecycleNonceStore({ pool });
      assert.equal(await reconnectedStore.consume({
        keyId: 'integration-key', nonce, expiresAt: Date.now() + 60_000
      }), false);
    });

    await t.test('database failures propagate instead of accepting a nonce', async () => {
      await pool.query('DROP TABLE baye_lifecycle_nonces');
      const store = createPostgresLifecycleNonceStore({ pool });
      await assert.rejects(() => store.consume({
        keyId: 'integration-key', nonce: 'must-fail-closed', expiresAt: Date.now() + 60_000
      }));
      await applyMigration(pool);
    });
  } finally {
    if (pool) await pool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});
