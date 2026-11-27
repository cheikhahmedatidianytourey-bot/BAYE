import test from 'node:test';
import assert from 'node:assert/strict';
import { runProjectBuildTest } from '../server/project-build-test-runner.js';

// G43 contract scenarios use synthetic projects and an injected mock adapter.
// They verify result/evidence contracts, not actual generated-app behavior.
const project = [
  { path: 'package.json', content: JSON.stringify({ scripts: { build: 'vite build' } }) },
  { path: 'README.md', content: '# Synthetic functional contract fixture' },
  { path: 'src/main.js', content: 'export const value = 1;' }
];

function adapterWith(result, requests = []) {
  return { execute: async request => { requests.push(request); return result; } };
}

test('functional contract forwards caller timeout and preserves build evidence', async () => {
  const requests = [];
  const result = await runProjectBuildTest(project, {
    sandbox: adapterWith({ exitCode: 0, stdout: 'build output', stderr: '' }, requests),
    timeoutMs: 5000
  });
  assert.equal(result.passed, true);
  assert.equal(result.stage, 'build');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].timeoutMs, 5000);
  assert.equal(requests[0].network, false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'build output');
  assert.equal(result.stderr, '');
});

test('functional contract rejects timeout values outside runner bounds', async () => {
  const requests = [];
  for (const timeoutMs of [0, 999, 120001, 1.5, '30000']) {
    const result = await runProjectBuildTest(project, {
      sandbox: adapterWith({ exitCode: 0 }, requests), timeoutMs
    });
    assert.equal(result.passed, false);
    assert.equal(result.stage, 'configuration');
    assert.ok(result.issues.some(issue => issue.code === 'TIMEOUT_OUT_OF_RANGE'));
  }
  assert.equal(requests.length, 0);
});

test('functional contract safely handles a null adapter result', async () => {
  const result = await runProjectBuildTest(project, { sandbox: adapterWith(null) });
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, null);
  assert.equal(result.timedOut, false);
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_FAILED'));
});

test('functional contract marks timeout outcome and keeps bounded evidence', async () => {
  const result = await runProjectBuildTest(project, {
    sandbox: adapterWith({ exitCode: null, timedOut: true, stdout: 'x'.repeat(15000), stderr: 'y'.repeat(15000) })
  });
  assert.equal(result.passed, false);
  assert.equal(result.timedOut, true);
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_TIMEOUT'));
  assert.equal(result.stdout.length, 12000);
  assert.equal(result.stderr.length, 12000);
});

test('functional contract does not report success for nonzero exit even with output', async () => {
  const result = await runProjectBuildTest(project, {
    sandbox: adapterWith({ exitCode: 1, stdout: 'partial output', stderr: 'synthetic error' })
  });
  assert.equal(result.passed, false);
  assert.equal(result.exitCode, 1);
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_FAILED'));
});
