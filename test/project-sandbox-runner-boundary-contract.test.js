import test from 'node:test';
import assert from 'node:assert/strict';
import { runProjectBuildTest } from '../server/project-build-test-runner.js';

const project = [
  { path: 'package.json', content: JSON.stringify({ scripts: { build: 'vite build' } }) },
  { path: 'src/main.js', content: 'export const value = 1;' }
];

function adapter(result, calls = []) {
  return { execute: async request => { calls.push(request); return result; } };
}

test('runner boundary fixes command, arguments and disables network', async () => {
  const calls = [];
  const result = await runProjectBuildTest(project, { sandbox: adapter({ exitCode: 0 }, calls), timeoutMs: 7000 });
  assert.equal(result.passed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args, ['run', 'build']);
  assert.equal(calls[0].network, false);
  assert.equal(calls[0].timeoutMs, 7000);
});

test('runner preflight prevents adapter invocation on unsafe project manifests', async () => {
  const calls = [];
  const unsafe = [...project, { path: '../escape.js', content: 'x' }];
  const result = await runProjectBuildTest(unsafe, { sandbox: adapter({ exitCode: 0 }, calls) });
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'preflight');
  assert.ok(result.issues.some(issue => issue.code === 'UNSAFE_PATH'));
  assert.equal(calls.length, 0);
});

test('runner preflight prevents adapter invocation when build script is absent', async () => {
  const calls = [];
  const files = project.map(file => file.path === 'package.json'
    ? { ...file, content: JSON.stringify({ scripts: {} }) }
    : file);
  const result = await runProjectBuildTest(files, { sandbox: adapter({ exitCode: 0 }, calls) });
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'preflight');
  assert.ok(result.issues.some(issue => issue.code === 'BUILD_SCRIPT_MISSING'));
  assert.equal(calls.length, 0);
});

test('runner reports missing adapter without attempting execution', async () => {
  const result = await runProjectBuildTest(project);
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'configuration');
  assert.ok(result.issues.some(issue => issue.code === 'SANDBOX_ADAPTER_REQUIRED'));
});

test('runner converts adapter exceptions into bounded failure evidence', async () => {
  const sandbox = { execute: async () => { throw new Error('x'.repeat(1000)); } };
  const result = await runProjectBuildTest(project, { sandbox });
  assert.equal(result.passed, false);
  assert.equal(result.stage, 'build');
  assert.ok(result.issues.some(issue => issue.code === 'SANDBOX_EXECUTION_ERROR'));
  assert.ok(result.issues[0].message.length <= 500);
});
