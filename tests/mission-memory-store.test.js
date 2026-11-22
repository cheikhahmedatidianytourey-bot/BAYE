import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PersistentMissionMemoryStore} from '../server/mission-memory-store.js';
import {createMissionMemory} from '../server/mission-memory.js';

async function fixture(options={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'baye-mission-memory-'));
 const store=new PersistentMissionMemoryStore({filePath:path.join(dir,'store.json'),...options});
 return {store,cleanup:()=>fs.rm(dir,{recursive:true,force:true})};
}
const ownerA='user:account-0001';
const ownerB='user:account-0002';
const memory=(missionId='mission_12345678',excerpt='A durable finding.')=>createMissionMemory({missionId,results:[{taskId:'research',status:'succeeded',output:{role:'research',content:excerpt}}]});

test('persists mission memory and reloads it from a fresh store instance',async()=>{
 const f=await fixture();
 try{
  const packet=memory();
  await f.store.save({ownerId:ownerA,memory:packet});
  const reopened=new PersistentMissionMemoryStore({filePath:f.store.filePath});
  const loaded=await reopened.load({ownerId:ownerA,missionId:packet.missionId});
  assert.deepEqual(loaded.memory,packet);
  assert.equal((await reopened.status()).records,1);
 }finally{await f.cleanup();}
});
test('isolates records by owner even when mission identifiers match',async()=>{
 const f=await fixture();
 try{
  await f.store.save({ownerId:ownerA,memory:memory()});
  assert.equal(await f.store.load({ownerId:ownerB,missionId:'mission_12345678'}),null);
 }finally{await f.cleanup();}
});
test('rejects malformed owner identifiers, invalid packets and cross-owner deletes',async()=>{
 const f=await fixture();
 try{
  await assert.rejects(()=>f.store.save({ownerId:'short',memory:memory()}),/owner/i);
  await assert.rejects(()=>f.store.save({ownerId:ownerA,memory:{version:1}}),/mémoire/i);
  await f.store.save({ownerId:ownerA,memory:memory()});
  assert.equal(await f.store.remove({ownerId:ownerB,missionId:'mission_12345678'}),false);
  assert.ok(await f.store.load({ownerId:ownerA,missionId:'mission_12345678'}));
 }finally{await f.cleanup();}
});
test('expires old records and validates retention bounds',async()=>{
 const f=await fixture({ttlMs:60_000});
 try{
  await f.store.save({ownerId:ownerA,memory:memory()});
  const data=JSON.parse(await fs.readFile(f.store.filePath,'utf8'));
  data.records[0].updatedAt=new Date(Date.now()-120_000).toISOString();
  await fs.writeFile(f.store.filePath,JSON.stringify(data));
  assert.equal(await f.store.load({ownerId:ownerA,missionId:'mission_12345678'}),null);
  await assert.rejects(async()=>new PersistentMissionMemoryStore({filePath:'/tmp/x',ttlMs:1}),/ttlMs/);
 }finally{await f.cleanup();}
});
test('rejects corrupt persisted data instead of silently discarding it',async()=>{
 const f=await fixture();
 try{
  await fs.mkdir(path.dirname(f.store.filePath),{recursive:true});
  await fs.writeFile(f.store.filePath,JSON.stringify({version:99,records:[]}));
  await assert.rejects(()=>f.store.status(),/corrupt|unsupported/i);
 }finally{await f.cleanup();}
});
test('serializes concurrent saves without losing records',async()=>{
 const f=await fixture();
 try{
  await Promise.all([
   f.store.save({ownerId:ownerA,memory:memory('mission_12345678','A')}),
   f.store.save({ownerId:ownerA,memory:memory('mission_87654321','B')})
  ]);
  assert.ok(await f.store.load({ownerId:ownerA,missionId:'mission_12345678'}));
  assert.ok(await f.store.load({ownerId:ownerA,missionId:'mission_87654321'}));
 }finally{await f.cleanup();}
});
