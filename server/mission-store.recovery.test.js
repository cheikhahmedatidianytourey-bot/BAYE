import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';

test('listing ignores orphaned temporary and lock artifacts after interrupted writes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-interrupted-write-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'Recovery after interrupted write'});
  await store.create(mission);
  await writeFile(join(dir,mission.id+'.json.orphan.tmp'),'partial write','utf8');
  await writeFile(join(dir,mission.id+'.json.lock'),'stale lock simulation','utf8');
  const records=await store.list();
  assert.equal(records.length,1);
  assert.deepEqual(records[0],mission);
  assert.deepEqual(await store.get(mission.id),mission);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('listing fails closed when a mission record itself is truncated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-truncated-record-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'Truncated mission record'});
  await store.create(mission);
  await writeFile(join(dir,mission.id+'.json'),'{"id":"truncated"','utf8');
  await assert.rejects(()=>store.get(mission.id));
  await assert.rejects(()=>store.list());
 }finally{await rm(dir,{recursive:true,force:true});}
});
