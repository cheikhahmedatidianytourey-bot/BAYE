import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderSandboxAdapter, getRenderSandboxAdapterStatus, runRepairSandboxOnRender } from './render-sandbox-adapter.js';

const env = {
  RENDER_API_KEY: 'test-only-api-key',
  RENDER_WORKSPACE_ID: 'tea-test123',
  RENDER_SANDBOX_GROUP_ID: 'sbg-test',
  RENDER_SANDBOX_SNAPSHOT_ID: 'snp-test',
  RENDER_SANDBOX_EXPECTED_COMMIT: '85efb9c67caa4e3674702ce4ece219a43fd9ce44'
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
  assert.equal(calls.uploads.length, 3);
  assert.ok(calls.uploads[0].data.toString('utf8').includes(env.RENDER_SANDBOX_EXPECTED_COMMIT));
  assert.ok(calls.uploads[0].data.toString('utf8').includes("['rev-parse', 'HEAD']"));
  const preflightScript = calls.uploads[0].data.toString('utf8');
  assert.ok(preflightScript.includes("createHash('sha256')"));
  assert.ok(preflightScript.includes("['hash-object', '--no-filters', '--', relative]"));
  assert.ok(preflightScript.includes("'server/ai/controlled-repair-gate.js'"));
  assert.ok(preflightScript.includes("'server/ai/repair-sandbox-runner.js'"));
  assert.ok(preflightScript.includes("'scripts/verify-snapshot-integrity.mjs'"));
  assert.ok(preflightScript.includes("'server/ai/snapshot-integrity-manifest.json'"));
  assert.ok(preflightScript.includes('snapshot integrity manifest mismatch'));
  assert.ok(preflightScript.includes('critical snapshot file content differs from the pinned Git tree'));
  assert.equal(calls.uploads[0].path, '/tmp/baye-snapshot-preflight.mjs');
  assert.equal(calls.commands[0].command, 'timeout -k 2 10s node /tmp/baye-snapshot-preflight.mjs');
  assert.ok(calls.commands.findIndex(item => item.command.includes('baye-snapshot-preflight')) < calls.commands.findIndex(item => item.command.includes('baye-apply-repair')));
  assert.equal(calls.uploads.some(file => file.data.toString('utf8').includes(env.RENDER_API_KEY)), false);
  assert.equal(calls.commands.some(item => item.command.includes('npm test')), true);
  assert.equal(calls.commands.some(item => item.command.includes('npm run build')), true);
  assert.equal(calls.commands.some(item => /node -e|curl |wget /.test(item.command)), false);
});

test('refuses an unready pinned snapshot before uploading or applying a repair patch', async () => {
  const { client, calls } = fakeClient({
    exitCodes: { 'node /tmp/baye-snapshot-preflight.mjs': 1 }
  });
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({ proposal, checks, limits, signal: new AbortController().signal });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /pinned BAYE snapshot is not ready/);
  assert.equal(result.cleanupStatus, 'terminated');
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].path, '/tmp/baye-snapshot-preflight.mjs');
  assert.equal(calls.commands.length, 1);
  assert.equal(calls.commands[0].command, 'timeout -k 2 10s node /tmp/baye-snapshot-preflight.mjs');
  assert.deepEqual(calls.terminated, ['sbx-test-123']);
});

test('runs critical-file integrity verification in preflight before any repair upload', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({ proposal, checks: ['unit-tests'], limits, signal: new AbortController().signal });

  assert.equal(result.status, 'passed');
  const script = calls.uploads[0].data.toString('utf8');
  for (const file of [
    'package.json',
    'server/ai/render-sandbox-adapter.js',
    'server/ai/controlled-repair-gate.js',
    'server/ai/repair-sandbox-runner.js'
  ]) assert.ok(script.includes("'" + file + "'"));
  assert.ok(script.includes("createHash('sha256')"));
  assert.ok(script.includes("['hash-object', '--no-filters', '--', relative]"));
  assert.ok(calls.commands[0].command.includes('baye-snapshot-preflight'));
  assert.equal(calls.uploads[1].path, '/tmp/baye-repair-manifest.json');
  assert.ok(calls.commands.findIndex(item => item.command.includes('baye-snapshot-preflight')) <
    calls.commands.findIndex(item => item.command.includes('baye-apply-repair')));
});

test('does not create a sandbox for unsupported security checks', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({
    proposal,
    checks: ['arbitrary-shell-command'],
    limits,
    signal: new AbortController().signal
  });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /unit-tests, application-build and offline security-tests/);
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

test('rejects malformed expected snapshot commit before creating resources', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({
    client,
    env: { ...env, RENDER_SANDBOX_EXPECTED_COMMIT: 'main' }
  });
  const result = await adapter.run({ proposal, checks: ['unit-tests'], limits });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /full 40-character Git commit SHA/);
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
  assert.equal(status.milestone, 'G87');
  assert.equal(status.sdkVersion, '1.11.0');
  assert.equal(status.networkPolicy, 'deny-all');
  assert.equal(status.memoryLimitMb, 2048);
  assert.equal(status.cpuCount, 1);
  assert.equal(status.apiKeyInjectedIntoSandbox, false);
  assert.deepEqual(status.supportedChecks, ['unit-tests', 'application-build', 'security-tests']);
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
