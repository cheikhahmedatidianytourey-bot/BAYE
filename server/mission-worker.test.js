import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';
import {MissionWorker} from './mission-worker.js';

async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'baye-worker-'));
 const store=await new MissionStore({directory:dir}).init();
 return {dir,store,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
test('worker executes dependency-ordered tasks and completes mission',async()=>{
 const {dir,store,cleanup}=await setup();
 try{
  const mission=createMission({goal:'worker test',tasks:[{id:'a',description:'first'},{id:'b',description:'second',dependencies:['a']}]});
  await store.create(mission);
  const worker=new MissionWorker({store,executeTask:async(task)=>'ok:'+task.id});
  assert.equal((await worker.runOne(mission.id)).status,'running');
  assert.equal((await store.get(mission.id)).tasks[1].status,'pending');
  assert.equal((await worker.runOne(mission.id)).status,'completed');
  const done=await store.get(mission.id);
  assert.equal(done.status,'completed');
  assert.deepEqual(done.checkpoint.completedTaskIds,['a','b']);
 }finally{await cleanup();}
});
test('worker retries task errors within configured attempt bound',async()=>{
 const {dir,store,cleanup}=await setup();
 try{
  const mission=createMission({goal:'retry test',tasks:[{id:'a',description:'flaky'}]});
  await store.create(mission);
  let calls=0;
  const worker=new MissionWorker({store,executeTask:async()=>{calls++;if(calls<2)throw Error('temporary');return 'ok';},maxTaskAttempts:3});
  assert.equal((await worker.runOne(mission.id)).status,'running');
  assert.equal((await store.get(mission.id)).tasks[0].status,'pending');
  assert.equal((await worker.runOne(mission.id)).status,'completed');
  assert.equal(calls,2);
 }finally{await cleanup();}
});
test('worker fails mission after attempt bound and does not silently execute failed tasks',async()=>{
 const {dir,store,cleanup}=await setup();
 try{
  const mission=createMission({goal:'failure test',tasks:[{id:'a',description:'always fail'}]});
  await store.create(mission);
  const worker=new MissionWorker({store,executeTask:async()=>{throw Error('permanent');},maxTaskAttempts:1});
  assert.equal((await worker.runOne(mission.id)).status,'failed');
  const failed=await store.get(mission.id);
  assert.equal(failed.status,'failed');
  assert.equal(failed.tasks[0].status,'failed');
 }finally{await cleanup();}
});
test('worker validates batch limits',async()=>{
 const {dir,store,cleanup}=await setup();
 try{
  const worker=new MissionWorker({store,executeTask:async()=>null});
  await assert.rejects(()=>worker.runAvailable({limit:101}),/limit/);
 }finally{await cleanup();}
});
