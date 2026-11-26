import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './mission-store.js';
import { createMission } from './mission-engine.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'baye-mission-store-multi-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return { directory, a: await new MissionStore({ directory }).init(), b: await new MissionStore({ directory }).init() };
}
const makeMission = () => createMission({
  goal: 'multi instance test', ownerRef: 'test-user', constraints: { scope: 'test' },
  tasks: [{ id: 'task-1', description: 'First task' }]
});

test('two independent store instances race to create the same ID: exactly one succeeds', async t => {
  const { a, b } = await fixture(t);
  const record = makeMission();
  const results = await Promise.allSettled([a.create(record), b.create(record)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
  assert.equal((await a.list()).length, 1);
});

test('two independent store instances save updates without corrupting the record', async t => {
  const { a, b } = await fixture(t);
  const record = makeMission();
  await a.create(record);
  const updates = [
    { ...record, goal: 'instance A update', updatedAt: new Date().toISOString() },
    { ...record, goal: 'instance B update', updatedAt: new Date().toISOString() }
  ];
  const results = await Promise.allSettled([a.save(updates[0]), b.save(updates[1])]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 2);
  const final = await a.get(record.id);
  assert.ok(updates.some(x => x.goal === final.goal));
  assert.equal(final.id, record.id);
  assert.equal((await a.list()).length, 1);
});
