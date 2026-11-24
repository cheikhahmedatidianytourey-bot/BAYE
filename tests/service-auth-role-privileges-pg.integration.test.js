import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool, Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { createPostgresLifecycleNonceStore } from '../server/mission-task-lifecycle-nonce-store-pg.js';

const databaseUrl = process.env.BAYE_TEST_DATABASE_URL;
const migration0063 = new URL('../migrations/0063_lifecycle_nonce_store.sql', import.meta.url);
const migration0069 = new URL('../migrations/0069_service_authenticator_nonce_privileges.sql', import.meta.url);
const roleName = 'baye_service_authenticator';

test('Gateway service-auth PostgreSQL role can consume nonces and has INSERT-only table access', {
  skip: !databaseUrl ? 'BAYE_TEST_DATABASE_URL is not configured' : false
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
    'Role integration tests are restricted to a local disposable PostgreSQL server.');
  assert.match(databaseName, /(^|[_-])test($|[_-])/i,
    'Database name must clearly identify a test database.');

  const schema = `baye_service_role_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 2 });
  let client;
  let roleCreated = false;
  try {
    const adminCheck = await admin.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
    assert.equal(adminCheck.rows[0]?.rolsuper, true,
      'Disposable CI database user must be a superuser to provision isolated test roles.');
    const existing = await admin.query('SELECT rolname FROM pg_roles WHERE rolname = $1', [roleName]);
    assert.equal(existing.rows.length, 0,
      'Refusing to modify a pre-existing database role; use an isolated CI cluster.');

    await admin.query(`CREATE ROLE ${roleName} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    roleCreated = true;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scoped = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 1 });
    try {
      await scoped.query(await readFile(migration0063, 'utf8'));
      await scoped.query(await readFile(migration0069, 'utf8'));
      const relation = `${schema}.baye_lifecycle_nonces`;
      const privileges = await admin.query(
        `SELECT
          has_schema_privilege($1, $2, 'USAGE') AS schema_usage,
          has_table_privilege($1, $3, 'SELECT') AS can_select,
          has_table_privilege($1, $3, 'INSERT') AS can_insert,
          has_table_privilege($1, $3, 'UPDATE') AS can_update,
          has_table_privilege($1, $3, 'DELETE') AS can_delete,
          has_table_privilege($1, $3, 'TRUNCATE') AS can_truncate`,
        [roleName, schema, relation]
      );
      assert.deepEqual(privileges.rows[0], {
        schema_usage: true, can_select: false, can_insert: true,
        can_update: false, can_delete: false, can_truncate: false
      });

      const roleState = await admin.query(
        'SELECT rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin FROM pg_roles WHERE rolname = $1',
        [roleName]
      );
      assert.deepEqual(roleState.rows[0], {
        rolsuper: false, rolcreatedb: false, rolcreaterole: false,
        rolinherit: false, rolcanlogin: false
      });

      client = new Client({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
      await client.connect();
      await client.query(`SET ROLE ${roleName}`);
      const store = createPostgresLifecycleNonceStore({ pool: client });
      assert.equal(await store.consume({
        keyId: 'gateway-service-key', nonce: 'gateway_role_nonce_0001', expiresAt: Date.now() + 60_000
      }), true);
      assert.equal(await store.consume({
        keyId: 'gateway-service-key', nonce: 'gateway_role_nonce_0001', expiresAt: Date.now() + 60_000
      }), false);
      await assert.rejects(() => client.query('SELECT nonce FROM baye_lifecycle_nonces'));
      await assert.rejects(() => client.query("UPDATE baye_lifecycle_nonces SET expires_at = NOW()"));
      await assert.rejects(() => client.query("DELETE FROM baye_lifecycle_nonces"));
    } finally {
      await scoped.end();
    }
  } finally {
    await client?.end().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    if (roleCreated) await admin.query(`DROP ROLE IF EXISTS ${roleName}`).catch(() => {});
    await admin.end();
  }
});
