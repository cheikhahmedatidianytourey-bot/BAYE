import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationEngine } from './verification-engine.js';
import { createMission, validateMission } from '../mission-engine.js';

test('verification engine reports pass/fail without aborting the scenario batch', async () => {
  const engine = createVerificationEngine();
  const report = await engine.run([
    { name: 'pass', run: () => assert.equal(2 + 2, 4) },
    { name: 'fail', run: () => assert.equal(2 + 2, 5) },
    { name: 'continue', run: () => assert.ok(true) }
  ]);
  assert.deepEqual([report.total, report.passed, report.failed], [3, 2, 1]);
  assert.equal(report.reports[1].status, 'failed');
  assert.match(report.reports[1].error, /5/);
});

test('scenario runner enforces scenario count and configuration bounds', async () => {
  assert.throws(() => createVerificationEngine({ maxScenarios: 1001 }), /bound/i);
  const engine = createVerificationEngine({ maxScenarios: 2 });
  await assert.rejects(() => engine.run([1, 2, 3]), /bound/i);
});

test('deterministic generated graph corpus validates acyclic chains', () => {
  for (const count of [0, 1, 2, 10, 50, 250]) {
    const tasks = Array.from({ length: count }, (_, i) => ({
      id: 'case-' + count + '-' + i,
      description: 'generated task',
      dependencies: i ? ['case-' + count + '-' + (i - 1)] : []
    }));
    const mission = createMission({ goal: 'verification generated chain', tasks });
    assert.equal(validateMission(mission).taskCount, count);
  }
});

test('deterministic mutation corpus rejects cycles and unknown dependencies', () => {
  for (let n = 2; n <= 25; n++) {
    const tasks = Array.from({ length: n }, (_, i) => ({
      id: 'm-' + i, description: 'task',
      dependencies: i === 0 ? ['m-' + (n - 1)] : ['m-' + (i - 1)]
    }));
    assert.throws(() => createMission({ goal: 'cycle corpus', tasks }), /cycle/i);
    const unknown = [{ id: 'root', description: 'task', dependencies: ['missing-' + n] }];
    assert.throws(() => createMission({ goal: 'unknown corpus', tasks: unknown }), /unknown task/i);
  }
});

test('runner bounds report error text and scenario count deterministically', async () => {
  const engine = createVerificationEngine({ maxScenarios: 5 });
  const report = await engine.run([{ name: 'large error', run: () => { throw new Error('x'.repeat(2000)); } }]);
  assert.equal(report.failed, 1);
  assert.ok(report.reports[0].error.length <= 500);
});

test('scenario timeout is reported and the batch continues', async () => {
  const engine = createVerificationEngine({ maxScenarioDurationMs: 10 });
  const report = await engine.run([
    { name: 'timeout', run: () => new Promise(() => {}) },
    { name: 'after-timeout', run: () => assert.ok(true) }
  ]);
  assert.equal(report.failed, 1);
  assert.match(report.reports[0].error, /time limit/i);
  assert.equal(report.reports[1].status, 'passed');
});

test('scenario duration configuration is bounded and scenarios are validated', async () => {
  assert.throws(() => createVerificationEngine({ maxScenarioDurationMs: 30001 }), /bound/i);
  const engine = createVerificationEngine();
  await assert.rejects(() => engine.run([{ name: 'invalid' }]), /invalid scenario/i);
});