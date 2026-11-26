import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './mission-store.js';
import { createMission } from './mission-engine.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'baye-mission-store-reliability-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return { directory, store: await new MissionStore({ directory }).init() };
}
const makeMission = (goal='reliability test') => createMission({
  goal, ownerRef: 'test-user', constraints: { scope: 'test' },
  tasks: [{ id: 'task-1', description: 'First task' }]
});

test('records remain readable from a fresh store instance after writes', async t => {
  const { directory, store } = await fixture(t);
  const record = makeMission();
  await store.create(record);
  const reopened = await new MissionStore({ directory }).init();
  assert.deepEqual(await reopened.get(record.id), record);
});

test('list ignores temporary files left beside mission records', async t => {
  const { directory, store } = await fixture(t);
  const record = makeMission();
  await store.create(record);
  await writeFile(join(directory, 'unfinished-write.tmp'), '{"incomplete":', 'utf8');
  assert.deepEqual((await store.list()).map(item => item.id), [record.id]);
});

test('corrupt stored JSON fails explicitly instead of silently disappearing', async t => {
  const { directory, store } = await fixture(t);
  const record = makeMission();
  await store.create(record);
  await writeFile(join(directory, record.id + '.json'), '{broken json', 'utf8');
  await assert.rejects(() => store.get(record.id));
  await assert.rejects(() => store.list());
});

test('serialized saves leave a valid persisted record after concurrent updates', async t => {
  const { store } = await fixture(t);
  const record = makeMission();
  await store.create(record);
  const updates = ['update-a', 'update-b', 'update-c'].map(goal => ({ ...record, goal, updatedAt: new Date().toISOString() }));
  await Promise.all(updates.map(updated => store.save(updated)));
  const final = await store.get(record.id);
  assert.ok(updates.some(updated => updated.goal === final.goal));
  assert.equal(final.id, record.id);
  assert.equal((await store.list()).length, 1);
});
