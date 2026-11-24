import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const migrationUrl = new URL('../migrations/0061_recovery_evidence_role_privileges.sql', import.meta.url);
const sql = readFileSync(fileURLToPath(migrationUrl), 'utf8');

test('migration requires pre-provisioned non-implicit role names and fails if missing', () => {
  assert.match(sql, /rolname = 'baye_recovery_worker'/);
  assert.match(sql, /rolname = 'baye_lifecycle_writer'/);
  assert.match(sql, /RAISE EXCEPTION/);
});

test('recovery worker receives SELECT only after broad privileges are revoked', () => {
  const revokeIndex = sql.indexOf('REVOKE ALL PRIVILEGES ON TABLE');
  const grantIndex = sql.indexOf('GRANT SELECT ON TABLE');
  assert.ok(revokeIndex >= 0 && grantIndex > revokeIndex);
  assert.match(sql, /FROM baye_recovery_worker/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE)[\s\S]*TO baye_recovery_worker/);
});

test('lifecycle writer receives only INSERT and UPDATE table privileges', () => {
  assert.match(sql, /GRANT INSERT, UPDATE ON TABLE public\.baye_mission_task_recovery_evidence TO baye_lifecycle_writer/);
  assert.doesNotMatch(sql, /GRANT DELETE[\s\S]*TO baye_lifecycle_writer/);
});
