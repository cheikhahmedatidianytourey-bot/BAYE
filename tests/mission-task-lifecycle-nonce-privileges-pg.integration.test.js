import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool, Client } from 'pg';
import { readFile } from 'node:fs/promises';
import { createPostgresLifecycleNonceStore } from '../server/mission-task-lifecycle-nonce-store-pg.js';

const databaseUrl = process.env.BAYE_TEST_DATABASE_URL;
const migration0063 = new URL('../migrations/0063_lifecycle_nonce_store.sql', import.meta.url);
const migration0065 = new URL('../migrations/0065_lifecycle_nonce_role_privileges.sql', import.meta.url);
const roleNames = ['baye_recovery_worker', 'baye_lifecycle_writer'];

test('PostgreSQL nonce roles enforce least privilege and service separation', {
  skip: !databaseUrl ? 'BAYE_TEST_DATABASE_URL is not configured' : false
}, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(parsed.hostname),
    'Role integration tests are restricted to a local disposable PostgreSQL server.');
  assert.match(databaseName, /(^|[_-])test($|[_-])/i,
    'Database name must clearly identify a test database.');

  const schema = `baye_role_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 2 });
  const clients = [];
  const createdRoles = [];
  try {
    const adminCheck = await admin.query(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user'
    );
    assert.equal(adminCheck.rows[0]?.rolsuper, true,
      'Disposable CI database user must be a superuser to provision and inspect isolated test roles.');

    const existing = await admin.query(
      'SELECT rolname FROM pg_roles WHERE rolname = ANY($1::text[])', [roleNames]
    );
    assert.deepEqual(existing.rows, [],
      'Refusing to modify pre-existing database roles; this test requires an isolated CI cluster.');

    await admin.query(`CREATE SCHEMA "${schema}"`);
    for (const role of roleNames) {
      await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      createdRoles.push(role);
    }

    const scoped = new Pool({
      connectionString: databaseUrl,
      options: `-c search_path=${schema}`,
      max: 2
    });
    try {
      await scoped.query(await readFile(migration0063, 'utf8'));
      await scoped.query(await readFile(migration0065, 'utf8'));

      const relation = `${schema}.baye_lifecycle_nonces`;
      const privileges = await admin.query(
        `SELECT
          has_table_privilege('baye_recovery_worker', $1, 'SELECT') AS worker_select,
          has_table_privilege('baye_recovery_worker', $1, 'INSERT') AS worker_insert,
          has_table_privilege('baye_recovery_worker', $1, 'UPDATE') AS worker_update,
          has_table_privilege('baye_lifecycle_writer', $1, 'SELECT') AS writer_select,
          has_table_privilege('baye_lifecycle_writer', $1, 'INSERT') AS writer_insert,
          has_table_privilege('baye_lifecycle_writer', $1, 'UPDATE') AS writer_update,
          has_table_privilege('baye_lifecycle_writer', $1, 'DELETE') AS writer_delete,
          has_table_privilege('baye_lifecycle_writer', $1, 'TRUNCATE') AS writer_truncate`,
        [relation]
      );
      assert.deepEqual(privileges.rows[0], {
        worker_select: false, worker_insert: false, worker_update: false,
        writer_select: false, writer_insert: true, writer_update: false,
        writer_delete: false, writer_truncate: false
      });

      const roleState = await admin.query(
        'SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolcanlogin FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname',
        [roleNames]
      );
      assert.equal(roleState.rows.length, 2);
      for (const role of roleState.rows) {
        assert.equal(role.rolsuper, false);
        assert.equal(role.rolcreatedb, false);
        assert.equal(role.rolcreaterole, false);
        assert.equal(role.rolinherit, false);
        assert.equal(role.rolcanlogin, false);
      }

      const memberships = await admin.query(
        `SELECT count(*)::int AS count FROM pg_auth_members
         WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[]))
            OR member IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[]))`,
        [roleNames]
      );
      assert.equal(memberships.rows[0].count, 0);

      const owner = await admin.query(
        'SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = $1::regclass',
        [relation]
      );
      assert.notEqual(owner.rows[0]?.owner, 'baye_recovery_worker');
      assert.notEqual(owner.rows[0]?.owner, 'baye_lifecycle_writer');

      const writer = new Client({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`
      });
      clients.push(writer);
      await writer.connect();
      await writer.query('SET ROLE baye_lifecycle_writer');
      const store = createPostgresLifecycleNonceStore({ pool: writer });
      assert.equal(await store.consume({
        keyId: 'least-privilege-key', nonce: 'writer-can-consume', expiresAt: Date.now() + 60_000
      }), true);
      assert.equal(await store.consume({
        keyId: 'least-privilege-key', nonce: 'writer-can-consume', expiresAt: Date.now() + 60_000
      }), false);
      await assert.rejects(() => writer.query('SELECT nonce FROM baye_lifecycle_nonces'));
      await assert.rejects(() => writer.query(
        "UPDATE baye_lifecycle_nonces SET expires_at = NOW() WHERE nonce = 'writer-can-consume'"
      ));
      await assert.rejects(() => writer.query(
        "DELETE FROM baye_lifecycle_nonces WHERE nonce = 'writer-can-consume'"
      ));

      const worker = new Client({
        connectionString: databaseUrl,
        options: `-c search_path=${schema}`
      });
      clients.push(worker);
      await worker.connect();
      await worker.query('SET ROLE baye_recovery_worker');
      await assert.rejects(() => worker.query('SELECT nonce FROM baye_lifecycle_nonces'));
      await assert.rejects(() => worker.query(
        "INSERT INTO baye_lifecycle_nonces (key_id, nonce, expires_at) VALUES ('worker', 'blocked', NOW())"
      ));
    } finally {
      await scoped.end();
    }
  } finally {
    await Promise.all(clients.map((client) => client.end().catch(() => {})));
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    for (const role of createdRoles.reverse()) {
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {});
    }
    await admin.end();
  }
});
