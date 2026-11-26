import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';

test('lock timeout fails closed and preserves the stored mission',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-storage-recovery-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'preserve data under lock contention'});
  await store.create(mission);
  const file=join(dir,mission.id+'.json');
  const lock=file+'.lock';
  await writeFile(lock,'test lock holder',{encoding:'utf8',flag:'wx'});
  const changed={...mission,goal:'must not be written'};
  await assert.rejects(()=>store._withLock(file,()=>store.save(changed),{timeoutMs:40}),/lock timeout/);
  assert.deepEqual(await store.get(mission.id),mission);
  assert.equal(await readFile(lock,'utf8'),'test lock holder');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('stale expectedUpdatedAt rejects a conflicting save without changing data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-storage-recovery-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'conflict recovery'});
  await store.create(mission);
  const changed={...mission,goal:'stale update'};
  await assert.rejects(()=>store.save(changed,{expectedUpdatedAt:'2000-01-01T00:00:00.000Z'}),/stale expectedUpdatedAt/);
  assert.deepEqual(await store.get(mission.id),mission);
 }finally{await rm(dir,{recursive:true,force:true});}
});
