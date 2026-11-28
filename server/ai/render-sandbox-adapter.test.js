import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderSandboxAdapter, getRenderSandboxAdapterStatus, runRepairSandboxOnRender } from './render-sandbox-adapter.js';

const env = {
  RENDER_API_KEY: 'test-only-api-key',
  RENDER_WORKSPACE_ID: 'tea-test123',
  RENDER_SANDBOX_GROUP_ID: 'sbg-test',
  RENDER_SANDBOX_SNAPSHOT_ID: 'snp-test'
};
const proposal = {
  id: 'repair-test',
  incidentId: 'incident-test',
  diagnosisCode: 'test-failure',
  reason: 'Apply a bounded test repair after evidence review.',
  changes: [{
    path: 'server/ai/retry.js',
    operation: 'modify',
    patch: '@@ -1 +1 @@\n-old\n+new'
  }]
};
const limits = { timeoutMs: 180000, memoryLimitMb: 2048, cpuCount: 1 };
const checks = ['unit-tests', 'application-build'];

function fakeClient({ exitCodes = {}, terminateError = null } = {}) {
  const calls = { create: [], wait: [], uploads: [], commands: [], terminated: [] };
  const client = {
    async create(options) {
      calls.create.push(options);
      return { id: 'sbx-test-123', status: 'creating' };
    },
    async waitUntilRunning(id, options) {
      calls.wait.push({ id, options });
      return { id, status: 'running' };
    },
    async upload(id, path, data, ownerId, options) {
      calls.uploads.push({ id, path, data: Buffer.from(data), ownerId, options });
    },
    async exec(id, command, ownerId, signal) {
      calls.commands.push({ id, command, ownerId, signal });
      const exitCode = Object.entries(exitCodes).find(([fragment]) => command.includes(fragment))?.[1] ?? 0;
      return (async function* () {
        yield { type: 'output', stream: 'stdout', data: 'sandbox output' };
        yield { type: 'exit', exit_code: exitCode };
      })();
    },
    async terminate(id) {
      calls.terminated.push(id);
      if (terminateError) throw terminateError;
    }
  };
  return { client, calls };
}

test('creates a deny-all disposable Render sandbox from the pinned snapshot and terminates it', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({ proposal, checks, limits, signal: new AbortController().signal });

  assert.equal(result.status, 'passed');
  assert.equal(result.sandboxId, 'sbx-test-123');
  assert.equal(result.cleanupStatus, 'terminated');
  assert.deepEqual(calls.terminated, ['sbx-test-123']);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0], {
    sandboxGroupId: 'sbg-test',
    snapshotId: 'snp-test',
    plan: '1c-2g',
    timeoutSeconds: 300,
    idleTimeoutSeconds: 300,
    networkPolicy: { type: 'deny-all' }
  });
  assert.equal(Object.hasOwn(calls.create[0], 'env'), false);
  assert.equal(calls.uploads.length, 2);
  assert.equal(calls.uploads.some(file => file.data.toString('utf8').includes(env.RENDER_API_KEY)), false);
  assert.equal(calls.commands.some(item => item.command.includes('npm test')), true);
  assert.equal(calls.commands.some(item => item.command.includes('npm run build')), true);
  assert.equal(calls.commands.some(item => /node -e|curl |wget /.test(item.command)), false);
});

test('does not create a sandbox for unsupported security checks', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({
    proposal,
    checks: ['security-tests'],
    limits,
    signal: new AbortController().signal
  });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /dedicated offline test command/);
  assert.equal(calls.create.length, 0);
});

test('rejects missing Render configuration before creating resources', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env: {} });
  const result = await adapter.run({ proposal, checks: ['unit-tests'], limits });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /RENDER_API_KEY/);
  assert.equal(calls.create.length, 0);
});

test('always attempts termination after a patch-application failure', async () => {
  const { client, calls } = fakeClient({ exitCodes: { 'node /tmp/baye-apply-repair.mjs': 1 } });
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({ proposal, checks: ['unit-tests'], limits });
  assert.equal(result.status, 'failed');
  assert.equal(result.cleanupStatus, 'terminated');
  assert.deepEqual(calls.terminated, ['sbx-test-123']);
  assert.equal(calls.commands.some(item => item.command.includes('npm test')), false);
});

test('reports unconfirmed cleanup as a failed validation', async () => {
  const { client } = fakeClient({ terminateError: new Error('termination API unavailable') });
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({ proposal, checks: ['unit-tests'], limits });
  assert.equal(result.status, 'failed');
  assert.equal(result.cleanupStatus, 'unconfirmed');
  assert.match(result.error, /termination not confirmed/);
});

test('rejects unsafe patch targets before creating a sandbox', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const unsafe = {
    ...proposal,
    changes: [{ path: 'server/ai/../../.env', operation: 'modify', patch: '@@ -1 +1 @@\n-a\n+b' }]
  };
  const result = await adapter.run({ proposal: unsafe, checks: ['unit-tests'], limits });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /repair proposal rejected/);
  assert.equal(calls.create.length, 0);
});

test('documents provider limits, credentials and currently supported checks', () => {
  const status = getRenderSandboxAdapterStatus();
  assert.equal(status.milestone, 'G82');
  assert.equal(status.sdkVersion, '1.5.0');
  assert.equal(status.networkPolicy, 'deny-all');
  assert.equal(status.memoryLimitMb, 2048);
  assert.equal(status.cpuCount, 1);
  assert.equal(status.apiKeyInjectedIntoSandbox, false);
  assert.deepEqual(status.supportedChecks, ['unit-tests', 'application-build']);
});

test('connects the Render adapter to G81 and keeps the human approval gates active', async () => {
  const { client, calls } = fakeClient();
  const input = {
    proposal: {
      ...proposal,
      incidentId: 'incident-test',
      diagnosisCode: 'test-failure',
      reason: 'Apply a bounded test repair after evidence review.'
    },
    humanApproval: true,
    testsPassed: true,
    diagnosisConfirmed: true,
    backupVerified: true,
    checks: ['unit-tests']
  };
  const result = await runRepairSandboxOnRender(input, { client, env });
  assert.equal(result.status, 'passed');
  assert.equal(result.proposalId, 'repair-test');
  assert.equal(result.sandboxId, 'sbx-test-123');
  assert.equal(result.cleanupStatus, 'terminated');
  assert.equal(result.execution.repositoryModified, false);

  const blocked = await runRepairSandboxOnRender({ ...input, humanApproval: false }, { client, env });
  assert.equal(blocked.status, 'blocked');
  assert.equal(calls.create.length, 1);
});
