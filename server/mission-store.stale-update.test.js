import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissionStore } from './mission-store.js';
import { createMission } from './mission-engine.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'baye-mission-store-stale-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return { directory, a: await new MissionStore({ directory }).init(), b: await new MissionStore({ directory }).init() };
}
const makeMission = () => createMission({
  goal: 'stale update test', ownerRef: 'test-user', constraints: { scope: 'test' },
  tasks: [{ id: 'task-1', description: 'First task' }]
});

test('save rejects a stale expectedUpdatedAt token after another instance updates', async t => {
  const { a, b } = await fixture(t);
  const initial = makeMission();
  await a.create(initial);
  const staleToken = initial.updatedAt;

  const fresh = { ...initial, goal: 'fresh update', updatedAt: new Date(Date.parse(initial.updatedAt) + 1000).toISOString() };
  await b.save(fresh, { expectedUpdatedAt: staleToken });

  const stale = { ...initial, goal: 'stale overwrite', updatedAt: new Date(Date.parse(initial.updatedAt) + 2000).toISOString() };
  await assert.rejects(a.save(stale, { expectedUpdatedAt: staleToken }), /conflict|stale/i);
  assert.equal((await a.get(initial.id)).goal, 'fresh update');
});

test('save without an expectedUpdatedAt token remains supported for existing callers', async t => {
  const { a } = await fixture(t);
  const initial = makeMission();
  await a.create(initial);
  const update = { ...initial, goal: 'legacy caller update', updatedAt: new Date(Date.parse(initial.updatedAt) + 1000).toISOString() };
  await a.save(update);
  assert.equal((await a.get(initial.id)).goal, 'legacy caller update');
});
