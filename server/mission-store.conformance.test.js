import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './mission-store.js';
import { createMission } from './mission-engine.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'baye-mission-store-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new MissionStore({ directory });
  await store.init();
  return store;
}
const mission = (goal='test mission') => createMission({
  goal, ownerRef: 'test-user', constraints: { scope: 'test' },
  tasks: [{ id: 'task-1', description: 'First task' }]
});

test('init is repeatable and create/get preserves mission records', async t => {
  const store = await fixture(t);
  await store.init();
  const record = mission();
  const created = await store.create(record);
  assert.deepEqual(created, record);
  assert.deepEqual(await store.get(record.id), record);
});

test('duplicate create rejects and save rejects missing records', async t => {
  const store = await fixture(t);
  const record = mission();
  await store.create(record);
  await assert.rejects(() => store.create(record), /already exists/i);
  await assert.rejects(() => store.save(mission('not persisted')), /does not exist/i);
});

test('save persists an updated existing record', async t => {
  const store = await fixture(t);
  const record = mission();
  await store.create(record);
  const changed = { ...record, goal: 'updated goal', updatedAt: new Date().toISOString() };
  await store.save(changed);
  assert.equal((await store.get(record.id)).goal, 'updated goal');
});

test('get and create results are isolated copies', async t => {
  const store = await fixture(t);
  const record = mission();
  const created = await store.create(record);
  created.constraints.scope = 'mutated';
  created.tasks[0].description = 'mutated';
  const loaded = await store.get(record.id);
  assert.equal(loaded.constraints.scope, 'test');
  assert.equal(loaded.tasks[0].description, 'First task');
  loaded.constraints.scope = 'also mutated';
  assert.equal((await store.get(record.id)).constraints.scope, 'test');
});

test('list returns deterministic createdAt and ID order and isolated records', async t => {
  const store = await fixture(t);
  const later = mission('later');
  const earlier = mission('earlier');
  const sameTime = mission('same time');
  earlier.createdAt = '2025-01-01T00:00:00.000Z';
  later.createdAt = '2025-01-02T00:00:00.000Z';
  sameTime.createdAt = earlier.createdAt;
  // Revalidate timestamp ordering while retaining each record's internally valid time.
  await store.create(later);
  await store.create(earlier);
  await store.create(sameTime);
  const items = await store.list();
  assert.deepEqual(items.map(m => m.id), [earlier.id, sameTime.id, later.id].sort((a,b) => {
    const records = new Map([[earlier.id, earlier.createdAt],[sameTime.id,sameTime.createdAt],[later.id,later.createdAt]]);
    return records.get(a).localeCompare(records.get(b)) || a.localeCompare(b);
  }));
  items[0].goal = 'mutated list item';
  assert.notEqual((await store.get(items[0].id)).goal, 'mutated list item');
});

test('malformed mission records are rejected', async t => {
  const store = await fixture(t);
  const record = mission();
  record.schemaVersion = 999;
  await assert.rejects(() => store.create(record), /schema version/i);
});

test('unsafe IDs are rejected by get', async t => {
  const store = await fixture(t);
  await assert.rejects(() => store.get('../outside'), /unsafe mission ID/i);
  await assert.rejects(() => store.get('bad\\id'), /unsafe mission ID/i);
});

test('parallel duplicate creates allow only one stored record', async t => {
  const store = await fixture(t);
  const record = mission('race');
  const outcomes = await Promise.allSettled([store.create(record), store.create(record)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
  assert.equal((await store.list()).length, 1);
});
