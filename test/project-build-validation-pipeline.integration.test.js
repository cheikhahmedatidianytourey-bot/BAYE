import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectFiles } from '../server/project-output-validator.js';
import { runProjectBuildTest } from '../server/project-build-test-runner.js';

const validProject = [
  { path: 'package.json', content: JSON.stringify({ scripts: { build: 'vite build' } }) },
  { path: 'README.md', content: '# Synthetic integration fixture' },
  { path: 'src/main.js', content: 'export const value = 1;' }
];

function sandboxReturning(result, observed = []) {
  return {
    execute: async request => {
      observed.push(request);
      return result;
    }
  };
}

test('pipeline rejects structurally unsafe output before sandbox handoff', async () => {
  const observed = [];
  const files = [...validProject, { path: '../escape.js', content: 'synthetic' }];
  const structural = validateProjectFiles(files);
  const result = await runProjectBuildTest(files, { sandbox: sandboxReturning({ exitCode: 0 }, observed) });
  assert.equal(structural.passed, false);
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'preflight');
  assert.equal(observed.length, 0);
});

test('pipeline hands validated project to adapter with network disabled', async () => {
  const observed = [];
  const result = await runProjectBuildTest(validProject, { sandbox: sandboxReturning({ exitCode: 0, stdout: 'synthetic build success' }, observed) });
  assert.equal(result.passed, true);
  assert.equal(result.stage, 'build');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].command, 'npm');
  assert.deepEqual(observed[0].args, ['run', 'build']);
  assert.equal(observed[0].network, false);
  assert.deepEqual(observed[0].files, validProject);
});

test('pipeline propagates a nonzero build outcome as failure', async () => {
  const result = await runProjectBuildTest(validProject, { sandbox: sandboxReturning({ exitCode: 2, stderr: 'synthetic failure' }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_FAILED'));
});

test('pipeline propagates timeout outcome without marking it successful', async () => {
  const result = await runProjectBuildTest(validProject, { sandbox: sandboxReturning({ exitCode: null, timedOut: true }) });
  assert.equal(result.passed, false);
  assert.equal(result.timedOut, true);
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_TIMEOUT'));
});

test('pipeline refuses execution when the isolated adapter throws', async () => {
  const sandbox = { execute: async () => { throw new Error('synthetic adapter interruption'); } };
  const result = await runProjectBuildTest(validProject, { sandbox });
  assert.equal(result.passed, false);
  assert.ok(result.issues.some(issue => issue.code === 'SANDBOX_EXECUTION_ERROR'));
});
