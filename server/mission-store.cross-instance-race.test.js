import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';

test('two store instances competing with the same version allow exactly one save',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-cross-instance-race-'));
 try{
  const first=await new MissionStore({directory:dir}).init();
  const second=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'cross-instance save race'});
  await first.create(mission);
  const expectedUpdatedAt=mission.updatedAt;
  const candidateA={...mission,goal:'writer A',updatedAt:'2026-01-01T00:00:01.000Z'};
  const candidateB={...mission,goal:'writer B',updatedAt:'2026-01-01T00:00:02.000Z'};
  const results=await Promise.allSettled([
   first.save(candidateA,{expectedUpdatedAt}),
   second.save(candidateB,{expectedUpdatedAt})
  ]);
  const fulfilled=results.filter(result=>result.status==='fulfilled');
  const rejected=results.filter(result=>result.status==='rejected');
  assert.equal(fulfilled.length,1);
  assert.equal(rejected.length,1);
  assert.match(rejected[0].reason.message,/stale expectedUpdatedAt/);
  const stored=await first.get(mission.id);
  assert.ok(['writer A','writer B'].includes(stored.goal));
  assert.equal(stored.updatedAt,stored.goal==='writer A'?candidateA.updatedAt:candidateB.updatedAt);
  assert.equal((await first.list()).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
