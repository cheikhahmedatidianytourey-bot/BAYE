import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPostgresLifecycleNonceStore } from '../server/mission-task-lifecycle-nonce-store-pg.js';
import { createBayeServiceAuthenticator } from '../server/service-producer-auth.js';

const databaseUrl = process.env.BAYE_TEST_DATABASE_URL;
const migrationUrl = new URL('../migrations/0063_lifecycle_nonce_store.sql', import.meta.url);
const primarySecret = 'postgres-service-auth-primary-secret-32-bytes';
const secondarySecret = 'postgres-service-auth-secondary-secret-32-bytes';
const serviceRegistry = {
  'lifecycle-producer': {
    keys: {
      'key-primary': primarySecret,
      'key-secondary': secondarySecret
    },
    scopes: ['lifecycle:evidence:write']
  }
};

function signedRequest({ nonce, keyId = 'key-primary', secret = primarySecret, timestamp = Date.now() }) {
  const method = 'POST';
  const target = '/internal/lifecycle/evidence?source=integration';
  const rawBody = Buffer.from('{"event":"lifecycle.updated"}');
  const canonical = [
    method,
    target,
    String(timestamp),
    nonce,
    createHash('sha256').update(rawBody).digest('hex'),
    'lifecycle-producer',
    keyId
  ].join('\n');
  const signature = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  const headers = {
    'x-baye-service-id': 'lifecycle-producer',
    'x-baye-key-id': keyId,
    'x-baye-timestamp': String(timestamp),
    'x-baye-nonce': nonce,
    'x-baye-signature': signature
  };
  return {
    method,
    originalUrl: target,
    rawBody,
    get(name) { return headers[name.toLowerCase()] ?? ''; }
  };
}

test('PostgreSQL-backed service authentication enforces durable single-use nonces', {
  skip: !databaseUrl ? 'BAYE_TEST_DATABASE_URL is not configured' : false
}, async (t) => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
    'Integration tests are restricted to a local disposable PostgreSQL server.');
  assert.match(databaseName, /(^|[_-])test($|[_-])/i,
    'Database name must clearly identify a test database.');

  const schema = `baye_service_auth_${randomUUID().replaceAll('-', '')}`;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
  let pool;
  const openScopedPool = () => new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`,
    max: 12
  });

  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    pool = openScopedPool();
    await pool.query(await readFile(migrationUrl, 'utf8'));

    const createAuthenticator = (targetPool) => createBayeServiceAuthenticator({
      services: serviceRegistry,
      nonceStore: createPostgresLifecycleNonceStore({ pool: targetPool }),
      requiredScope: 'lifecycle:evidence:write'
    });

    await t.test('concurrent identical signed requests admit exactly one producer', async () => {
      const authenticate = createAuthenticator(pool);
      const request = signedRequest({ nonce: 'pg-service-race-000001' });
      const attempts = await Promise.all(Array.from({ length: 32 }, () => authenticate(request)));
      assert.equal(attempts.filter(Boolean).length, 1);
      assert.equal(attempts.filter((value) => value === null).length, 31);
      const rows = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE key_id = $1 AND nonce = $2',
        ['svc_lifecycle-producer_key-primary', 'pg-service-race-000001']
      );
      assert.equal(rows.rows[0].count, 1);
    });

    await t.test('replay remains rejected after PostgreSQL pool reconnection', async () => {
      const request = signedRequest({ nonce: 'pg-service-reconnect-0001' });
      assert.ok(await createAuthenticator(pool)(request));
      await pool.end();
      pool = openScopedPool();
      assert.equal(await createAuthenticator(pool)(request), null);
    });

    await t.test('nonce namespaces isolate key IDs during controlled key rotation', async () => {
      const authenticate = createAuthenticator(pool);
      const nonce = 'pg-service-key-scope-0001';
      assert.ok(await authenticate(signedRequest({ nonce, keyId: 'key-primary', secret: primarySecret })));
      assert.ok(await authenticate(signedRequest({ nonce, keyId: 'key-secondary', secret: secondarySecret })));
      const rows = await pool.query(
        'SELECT count(*)::int AS count FROM baye_lifecycle_nonces WHERE nonce = $1',
        [nonce]
      );
      assert.equal(rows.rows[0].count, 2);
    });

    await t.test('database outage fails closed without accepting the producer', async () => {
      await pool.query('DROP TABLE baye_lifecycle_nonces');
      const authenticate = createAuthenticator(pool);
      assert.equal(await authenticate(signedRequest({ nonce: 'pg-service-db-failure-0001' })), null);
      await pool.query(await readFile(migrationUrl, 'utf8'));
    });
  } finally {
    if (pool) await pool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});
