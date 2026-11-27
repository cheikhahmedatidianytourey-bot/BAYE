import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';

test('interrupted atomic-save artifacts do not mask or corrupt canonical mission records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-interrupted-write-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'recover canonical record after interrupted save'});
  await store.create(mission);
  const canonical=join(dir,mission.id+'.json');
  const orphan=canonical+'.interrupted.tmp';
  const partial='{"goal":"partial write left by interrupted process"';
  await writeFile(orphan,partial,{encoding:'utf8',flag:'wx'});
  assert.deepEqual(await store.get(mission.id),mission);
  assert.deepEqual(await store.list(),[mission]);
  assert.equal(await readFile(orphan,'utf8'),partial);
 }finally{await rm(dir,{recursive:true,force:true});}
});
