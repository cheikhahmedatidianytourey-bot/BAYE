import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMissionRouter} from './mission-api.js';
import {createMission} from './mission-engine.js';
import {MissionStore} from './mission-store.js';
import {MissionWorker} from './mission-worker.js';
import {createMissionAuthenticator,hashMissionToken} from './mission-auth.js';

const TOKEN='test-mission-token-user-a-that-is-at-least-32-characters';
const TOKEN_B='test-mission-token-user-b-that-is-at-least-32-characters';
const authenticate=createMissionAuthenticator({tokenRecords:[
  {tokenHash:hashMissionToken(TOKEN),userId:'user-a'},
  {tokenHash:hashMissionToken(TOKEN_B),userId:'user-b'}
]});

async function setup(t,{rateLimiter=null,workerOverride=null,auth=authenticate}={}){
  const directory=await mkdtemp(join(tmpdir(),'baye-api-'));
  const store=await new MissionStore({directory}).init();
  const worker=workerOverride||new MissionWorker({store,maxTaskAttempts:2,executeTask:async task=>'done:'+task.id});
  const app=express();
  app.use(express.json({limit:'20kb'}));
  app.use('/api/missions',createMissionRouter({store,worker,authenticate:auth,rateLimiter}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();
  const base='http://127.0.0.1:'+address.port+'/api/missions';
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  return {base,store};
}

async function request(base,path='',{method='GET',token=TOKEN,body}={}){
  const headers={};
  if(token)headers.authorization='Bearer '+token;
  if(body!==undefined)headers['content-type']='application/json';
  return fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}

test('mission API rejects missing and invalid bearer tokens',async t=>{
  const {base}=await setup(t);
  assert.equal((await request(base,'/status',{token:null})).status,401);
  assert.equal((await request(base,'/status',{token:'wrong-token'})).status,401);
  assert.equal((await request(base,'/status')).status,200);
});

test('mission API creates, lists and retrieves an authenticated mission',async t=>{
  const {base}=await setup(t);
  const created=await request(base,'',{method:'POST',body:{goal:'API integration test',tasks:[{id:'task-1',description:'Write a summary'}]}});
  assert.equal(created.status,201);
  const mission=await created.json();
  assert.equal(mission.status,'queued');
  assert.equal(mission.tasks.length,1);
  assert.equal('ownerRef' in mission,false);
  const listed=await request(base);
  assert.equal((await listed.json()).items[0].id,mission.id);
  const fetched=await request(base,'/'+mission.id);
  assert.equal((await fetched.json()).goal,'API integration test');
});

test('mission API enforces goal, task count and task description bounds',async t=>{
  const {base}=await setup(t);
  assert.equal((await request(base,'',{method:'POST',body:{goal:'',tasks:[{description:'task'}]}})).status,400);
  assert.equal((await request(base,'',{method:'POST',body:{goal:'too many',tasks:Array.from({length:11},(_,i)=>({id:'t'+i,description:'task'}))}})).status,400);
  assert.equal((await request(base,'',{method:'POST',body:{goal:'too long task',tasks:[{description:'x'.repeat(1001)}]}})).status,400);
  assert.equal((await request(base,'',{method:'POST',body:{goal:'bad constraints',tasks:[{description:'task'}],constraints:[]}})).status,400);
});

test('mission API runs one bounded task and returns the updated mission',async t=>{
  const {base}=await setup(t);
  const created=await request(base,'',{method:'POST',body:{goal:'run test',tasks:[{id:'one',description:'first'},{id:'two',description:'second',dependencies:['one']}] }});
  const mission=await created.json();
  const first=await request(base,'/'+mission.id+'/run',{method:'POST'});
  assert.equal(first.status,200);
  const firstBody=await first.json();
  assert.equal(firstBody.worker.taskId,'one');
  assert.equal(firstBody.mission.tasks[0].status,'completed');
  assert.equal(firstBody.mission.tasks[1].status,'pending');
  const second=await request(base,'/'+mission.id+'/run',{method:'POST'});
  assert.equal((await second.json()).mission.status,'completed');
});

test('mission API returns not found for unknown mission IDs',async t=>{
  const {base}=await setup(t);
  assert.equal((await request(base,'/not-a-real-mission')).status,404);
  assert.equal((await request(base,'/not-a-real-mission/run',{method:'POST'})).status,404);
});

test('mission API fails closed when per-user authentication is not configured',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'baye-api-config-'));
  const store=await new MissionStore({directory}).init();
  const worker=new MissionWorker({store,executeTask:async()=>null});
  const app=express();
  app.use('/api/missions',createMissionRouter({store,worker,authenticate:null}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/missions/status');
  assert.equal(response.status,503);
});


test('mission API omits internal errors, results, audit and storage paths from public responses',async t=>{
  const {base,store}=await setup(t);
  const created=await request(base,'',{method:'POST',body:{goal:'projection test',tasks:[{id:'safe-task',description:'safe description'}]}});
  const mission=await created.json();
  const persisted=await store.get(mission.id);
  persisted.tasks[0].resultRef='sensitive provider output';
  persisted.tasks[0].error='internal provider detail';
  persisted.audit.push({event:'secret-internal-event',at:new Date().toISOString()});
  persisted.retry.lastError='sensitive retry detail';
  await store.save(persisted);
  const response=await (await request(base,'/'+mission.id)).json();
  assert.equal('ownerRef' in response,false);
  assert.equal('checkpoint' in response,false);
  assert.equal('retry' in response,false);
  assert.equal('audit' in response,false);
  assert.equal('resultRef' in response.tasks[0],false);
  assert.equal('error' in response.tasks[0],false);
  const status=await (await request(base,'/status')).json();
  assert.equal(status.storage,'filesystem');
  assert.equal(JSON.stringify(status).includes(store.directory),false);
});

test('unauthenticated requests do not consume the rate limiter',async t=>{
  let limiterCalls=0;
  const rateLimiter=(_req,_res,next)=>{limiterCalls++;next();};
  const {base}=await setup(t,{rateLimiter});
  assert.equal((await request(base,'',{method:'POST',token:'invalid',body:{goal:'x',tasks:[{description:'x'}]}})).status,401);
  assert.equal(limiterCalls,0);
  assert.equal((await request(base,'',{method:'POST',body:{goal:'valid',tasks:[{description:'valid task'}]}})).status,201);
  assert.equal(limiterCalls,1);
});

test('mission API returns conflict when a mission is already being processed',async t=>{
  const {base}=await setup(t,{workerOverride:{runOne:async missionId=>({status:'busy',missionId})}});
  const created=await request(base,'',{method:'POST',body:{goal:'busy test',tasks:[{id:'busy-task',description:'wait'}]}});
  const mission=await created.json();
  const response=await request(base,'/'+mission.id+'/run',{method:'POST'});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'Mission is already being processed.');
});


test('mission API isolates create, list, read and run operations by authenticated user',async t=>{
  const {base,store}=await setup(t);
  const created=await request(base,'',{method:'POST',token:TOKEN,body:{goal:'private to user a',tasks:[{id:'private-task',description:'private work'}]}});
  assert.equal(created.status,201);
  const mission=await created.json();
  assert.equal((await store.get(mission.id)).ownerRef,'user-a');

  const userAList=await (await request(base,'',{token:TOKEN})).json();
  assert.equal(userAList.items.length,1);
  assert.equal(userAList.items[0].id,mission.id);

  const userBList=await (await request(base,'',{token:TOKEN_B})).json();
  assert.equal(userBList.items.length,0);
  assert.equal((await request(base,'/'+mission.id,{token:TOKEN_B})).status,404);
  assert.equal((await request(base,'/'+mission.id+'/run',{method:'POST',token:TOKEN_B})).status,404);

  const ownRead=await request(base,'/'+mission.id,{token:TOKEN});
  assert.equal(ownRead.status,200);
  const ownRun=await request(base,'/'+mission.id+'/run',{method:'POST',token:TOKEN});
  assert.equal(ownRun.status,200);
});

test('mission API does not accept the legacy shared bearer token as a tenant identity',async t=>{
  const {base}=await setup(t);
  const legacy='legacy-shared-bearer-token-that-is-not-registered';
  assert.equal((await request(base,'/status',{token:legacy})).status,401);
});
