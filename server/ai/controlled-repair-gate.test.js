import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRepairProposal, evaluateRepairGate, getControlledRepairStatus } from './controlled-repair-gate.js';

const baseChange = { path: 'server/ai/retry.js', operation: 'modify', patch: '@@ -1 +1 @@\n-old\n+new' };
const proposal = {
  id: 'repair-1',
  incidentId: 'incident-1',
  diagnosisCode: 'timeout',
  reason: 'Bound the retry loop after confirmed timeout evidence.',
  changes: [baseChange]
};

test('accepts a bounded JavaScript target directly inside server/ai', () => {
  const result = validateRepairProposal(proposal);
  assert.equal(result.status, 'validated');
  assert.equal(result.fileCount, 1);
});

test('rejects paths outside the single allowed directory', () => {
  const paths = [
    '../secret.js', '/tmp/file.js', '.github/workflows/ci.yml', '.env',
    'server/ai/nested/retry.js', 'server/other/retry.js', 'src/retry.js',
    'server/ai/../retry.js', 'server/ai/%2e%2e.js', 'server\\ai\\retry.js'
  ];
  for (const path of paths) {
    const result = validateRepairProposal({ ...proposal, changes: [{ ...baseChange, path }] });
    assert.equal(result.status, 'rejected', path);
  }
});

test('rejects sensitive filenames and non-JavaScript extensions', () => {
  const paths = [
    'server/ai/secrets.js', 'server/ai/auth-handler.js',
    'server/ai/token_store.js', 'server/ai/runtime.config.js',
    'server/ai/private-key.js', 'server/ai/workflow.js',
    'server/ai/.env.js', 'server/ai/settings.json', 'server/ai/cert.pem'
  ];
  for (const path of paths) {
    const result = validateRepairProposal({ ...proposal, changes: [{ ...baseChange, path }] });
    assert.equal(result.status, 'rejected', path);
  }
});

test('blocks until all independent approval gates are satisfied', () => {
  const result = evaluateRepairGate({ proposal });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blockers.length, 4);
  assert.equal(result.execution.applied, false);
});

test('allows manual review only after approval, tests, diagnosis and backup', () => {
  const result = evaluateRepairGate({
    proposal, humanApproval: true, testsPassed: true,
    diagnosisConfirmed: true, backupVerified: true
  });
  assert.equal(result.status, 'eligible_for_manual_review');
  assert.equal(result.execution.filesWritten, 0);
});

test('rejects excessive files, duplicate paths and oversized patches', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ ...baseChange, path: `server/ai/module-${index}.js` }));
  assert.equal(validateRepairProposal({ ...proposal, changes: many }).status, 'rejected');
  assert.equal(validateRepairProposal({ ...proposal, changes: [baseChange, baseChange] }).status, 'rejected');
  assert.equal(validateRepairProposal({ ...proposal, changes: [{ ...baseChange, patch: 'x'.repeat(12001) }] }).status, 'rejected');
});

test('rejects missing diagnosis and unsupported operations', () => {
  assert.equal(validateRepairProposal({ ...proposal, diagnosisCode: '' }).status, 'rejected');
  assert.equal(validateRepairProposal({ ...proposal, changes: [{ ...baseChange, operation: 'delete' }] }).status, 'rejected');
});

test('reports a strict non-writing posture and the narrow target allowlist', () => {
  const status = getControlledRepairStatus();
  assert.equal(status.milestone, 'G80.1');
  assert.equal(status.limits.allowedTargetDirectory, 'server/ai');
  assert.equal(status.appliesPatches, false);
  assert.equal(status.writesFiles, false);
  assert.equal(status.repositoryWriteAccess, false);
});
