import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';

test('mission store persists and retrieves records across store instances',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-missions-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'Persist mission'});
  await store.create(mission);
  const reopened=await new MissionStore({directory:dir}).init();
  assert.deepEqual(await reopened.get(mission.id),mission);
  assert.equal((await reopened.list()).length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('store rejects duplicate creation and save of missing mission',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-missions-'));
 try{
  const store=await new MissionStore({directory:dir}).init(), mission=createMission({goal:'Conflict'});
  await store.create(mission);
  await assert.rejects(()=>store.create(mission),/already exists/);
  await assert.rejects(()=>store.save({...mission,id:'missing'}),/does not exist/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('store validates record and guards unsafe IDs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-missions-'));
 try{
  const store=await new MissionStore({directory:dir}).init(), mission=createMission({goal:'Validate'});
  await assert.rejects(()=>store.get('../escape'),/Unsafe mission ID/);
  await assert.rejects(()=>store.create({...mission,status:'unknown'}),/Invalid mission status/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('serialized concurrent creates do not overwrite one another',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-missions-'));
 try{
  const store=await new MissionStore({directory:dir}).init(), a=createMission({goal:'A'}),b=createMission({goal:'B'});
  await Promise.all([store.create(a),store.create(b)]);
  assert.equal((await store.list()).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('store listing fails closed on corrupt mission JSON',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-missions-'));
 try{
  const store=await new MissionStore({directory:dir}).init();
  const mission=createMission({goal:'Corrupt file'});
  await store.create(mission);
  const {writeFile}=await import('node:fs/promises');
  await writeFile(join(dir,mission.id+'.json'),'not-json');
  await assert.rejects(()=>store.list());
 }finally{await rm(dir,{recursive:true,force:true});}
});
