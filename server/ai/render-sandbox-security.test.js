import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderSandboxAdapter } from './render-sandbox-adapter.js';

const env = {
  RENDER_API_KEY: 'test-only-api-key',
  RENDER_WORKSPACE_ID: 'tea-test123',
  RENDER_SANDBOX_GROUP_ID: 'sbg-test',
  RENDER_SANDBOX_SNAPSHOT_ID: 'snp-test'
};
const proposal = {
  id: 'security-test',
  incidentId: 'incident-security',
  diagnosisCode: 'security-regression',
  reason: 'Validate sandbox security boundaries with offline tests.',
  changes: [{
    path: 'server/ai/retry.js',
    operation: 'modify',
    patch: '@@ -1 +1 @@\n-old\n+new'
  }]
};
const limits = { timeoutMs: 180000, memoryLimitMb: 2048, cpuCount: 1 };

function fakeClient({ exitCode = 0 } = {}) {
  const calls = { create: [], uploads: [], commands: [], terminated: [] };
  return {
    calls,
    client: {
      async create(options) {
        calls.create.push(options);
        return { id: 'sbx-security-test' };
      },
      async waitUntilRunning() {},
      async upload(id, path, data) {
        calls.uploads.push({ id, path, data: Buffer.from(data) });
      },
      async exec(id, command) {
        calls.commands.push(command);
        return (async function* () {
          yield { type: 'output', data: 'offline security validation' };
          yield { type: 'exit', exit_code: exitCode };
        })();
      },
      async terminate(id) { calls.terminated.push(id); }
    }
  };
}

test('runs the dedicated security command inside the deny-all sandbox', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const result = await adapter.run({
    proposal,
    checks: ['security-tests'],
    limits,
    signal: new AbortController().signal
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.cleanupStatus, 'terminated');
  assert.deepEqual(calls.create[0].networkPolicy, { type: 'deny-all' });
  assert.equal(calls.commands.some(command => command.includes('npm run test:security')), true);
  assert.equal(calls.terminated.length, 1);
  assert.equal(calls.create.some(options => JSON.stringify(options).includes(env.RENDER_API_KEY)), false);
  assert.equal(calls.uploads.some(file => file.data.toString('utf8').includes(env.RENDER_API_KEY)), false);
});

test('rejects unsafe proposal paths before allocating a sandbox', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const unsafe = {
    ...proposal,
    changes: [{ path: 'server/ai/../../.env', operation: 'modify', patch: '@@ -1 +1 @@\n-a\n+b' }]
  };
  const result = await adapter.run({
    proposal: unsafe,
    checks: ['security-tests'],
    limits,
    signal: new AbortController().signal
  });

  assert.equal(result.status, 'failed');
  assert.equal(calls.create.length, 0);
});

test('does not allocate a sandbox when the operation is already aborted', async () => {
  const { client, calls } = fakeClient();
  const adapter = createRenderSandboxAdapter({ client, env });
  const controller = new AbortController();
  controller.abort();

  const result = await adapter.run({
    proposal,
    checks: ['security-tests'],
    limits,
    signal: controller.signal
  });

  assert.equal(result.status, 'failed');
  assert.match(result.error, /aborted before creation/);
  assert.equal(calls.create.length, 0);
});
