import test from 'node:test';
import assert from 'node:assert/strict';
import { runRepairSandbox, getRepairSandboxStatus } from './repair-sandbox-runner.js';

const proposal = {
  id: 'repair-1',
  incidentId: 'incident-1',
  diagnosisCode: 'timeout',
  reason: 'Correct a bounded retry condition after confirmed evidence.',
  changes: [{ path: 'server/ai/retry.js', operation: 'modify', patch: '@@ -1 +1 @@\n-old\n+new' }]
};
const gates = { humanApproval: true, testsPassed: true, diagnosisConfirmed: true, backupVerified: true };
const capabilities = {
  isolatedExecution: true,
  disposableWorkspace: true,
  resourceLimitsEnforced: true,
  timeoutEnforced: true,
  networkAccess: false,
  hostFilesystemAccess: false,
  repositoryAccess: false
};
const adapter = {
  capabilities,
  async run({ checks }) {
    return { status: 'passed', checks: checks.map(id => ({ id, status: 'passed', summary: id + ' passed' })) };
  }
};

test('runs allow-listed checks through an explicitly injected isolated host adapter', async () => {
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests', 'application-build'] }, adapter);
  assert.equal(result.status, 'passed');
  assert.equal(result.checks.length, 2);
  assert.equal(result.execution.repositoryModified, false);
});

test('blocks execution unless all G80 approval gates are satisfied', async () => {
  const result = await runRepairSandbox({ proposal, checks: ['unit-tests'] }, adapter);
  assert.equal(result.status, 'blocked');
  assert.equal(result.blockers.length, 4);
});

test('rejects missing adapter and adapter without strict isolation capabilities', async () => {
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, null)).status, 'rejected');
  const unsafe = { ...adapter, capabilities: { ...capabilities, networkAccess: true } };
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, unsafe);
  assert.equal(result.status, 'rejected');
});

test('rejects arbitrary commands, duplicate checks and excessive timeout', async () => {
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['node -e malicious'] }, adapter)).status, 'rejected');
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests', 'unit-tests'] }, adapter)).status, 'rejected');
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'], timeoutMs: 300000 }, adapter)).status, 'rejected');
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['security-tests'] }, adapter)).status, 'rejected');
});

test('rejects incomplete, duplicate or malformed adapter evidence', async () => {
  const incomplete = { ...adapter, async run() { return { status: 'passed', checks: [] }; } };
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, incomplete);
  assert.equal(result.status, 'failed');
  const duplicate = { ...adapter, async run() { return { status: 'passed', checks: [{ id: 'unit-tests', status: 'passed' }, { id: 'unit-tests', status: 'passed' }] }; } };
  assert.equal((await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, duplicate)).status, 'failed');
});

test('preserves sandbox identity and cleanup evidence from the host adapter', async () => {
  const withMetadata = {
    ...adapter,
    async run({ checks }) {
      return {
        status: 'passed',
        sandboxId: 'sbx-test',
        cleanupStatus: 'terminated',
        checks: checks.map(id => ({ id, status: 'passed' }))
      };
    }
  };
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, withMetadata);
  assert.equal(result.sandboxId, 'sbx-test');
  assert.equal(result.cleanupStatus, 'terminated');
});

test('reports failures and bounds returned summaries', async () => {
  const failing = { ...adapter, async run({ checks }) { return { status: 'failed', checks: checks.map(id => ({ id, status: 'error', summary: 'x'.repeat(700) })) }; } };
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'] }, failing);
  assert.equal(result.status, 'failed');
  assert.equal(result.checks[0].summary.length, 500);
});

test('signals timeout to the host adapter and returns bounded failure', async () => {
  let receivedSignal;
  const slow = {
    ...adapter,
    async run({ signal }) {
      receivedSignal = signal;
      return new Promise(resolve => {
        signal.addEventListener('abort', () => {
          resolve({ status: 'failed', checks: [{ id: 'unit-tests', status: 'error' }] });
        }, { once: true });
      });
    }
  };
  const result = await runRepairSandbox({ proposal, ...gates, checks: ['unit-tests'], timeoutMs: 100 }, slow);
  assert.equal(result.status, 'failed');
  assert.equal(result.error, 'sandbox orchestration timed out');
  assert.equal(receivedSignal.aborted, true);
});

test('exposes the verified Render-compatible resource envelope and safety boundaries', () => {
  const status = getRepairSandboxStatus();
  assert.equal(status.milestone, 'G81');
  assert.equal(status.requiresTrustedHostAdapter, true);
  assert.equal(status.builtInProcessExecution, false);
  assert.equal(status.networkAccess, false);
  assert.equal(status.limits.memoryLimitMb, 2048);
  assert.equal(status.limits.cpuCount, 1);
  assert.equal(status.limits.maxTimeoutMs, 240000);
});
