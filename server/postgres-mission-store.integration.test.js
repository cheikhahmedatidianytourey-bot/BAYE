import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {fileURLToPath} from 'node:url';
import {PostgresMissionStore} from './postgres-mission-store.js';
import {createMission} from './mission-engine.js';

const databaseUrl=process.env.BAYE_TEST_DATABASE_URL;
const here=fileURLToPath(new URL('.',import.meta.url));

test('PostgresMissionStore integration: CRUD, task synchronization and concurrent optimistic saves', {skip:!databaseUrl?'BAYE_TEST_DATABASE_URL is not configured':false}, async()=>{
 const admin=new Pool({connectionString:databaseUrl,connectionTimeoutMillis:10000,max:2});
 const schema='baye_it_'+randomUUID().replaceAll('-','');
 const quotedSchema='"'+schema+'"';
 let pool;
 try{
  await admin.query('CREATE SCHEMA '+quotedSchema);
  pool=new Pool({connectionString:databaseUrl,options:'-c search_path='+schema,connectionTimeoutMillis:10000,max:8});
  const migration=await readFile(join(here,'storage','migrations','001_missions.sql'),'utf8');
  await pool.query(migration);
  const storeA=new PostgresMissionStore({pool});
  const storeB=new PostgresMissionStore({pool});
  await storeA.init();
  const initial=createMission({goal:'PostgreSQL integration',ownerRef:'integration-user',tasks:[
   {id:'task-a',description:'First task'},
   {id:'task-b',description:'Second task',dependencies:['task-a']}
  ]});
  await storeA.create(initial);
  assert.deepEqual(await storeA.get(initial.id),initial);
  assert.equal((await storeA.list()).length,1);
  let taskRows=await pool.query('SELECT task_id,owner_id FROM baye_mission_tasks WHERE mission_id=$1 ORDER BY task_order',[initial.id]);
  assert.deepEqual(taskRows.rows.map(row=>row.task_id),['task-a','task-b']);
  assert.ok(taskRows.rows.every(row=>row.owner_id==='integration-user'));

  const updated={...initial,goal:'PostgreSQL task sync updated',tasks:[{...initial.tasks[0],description:'Renamed first task'}],updatedAt:new Date(Date.parse(initial.updatedAt)+1000).toISOString()};
  await storeA.save(updated,{expectedUpdatedAt:initial.updatedAt});
  taskRows=await pool.query('SELECT task_id,record_json FROM baye_mission_tasks WHERE mission_id=$1',[initial.id]);
  assert.equal(taskRows.rowCount,1);
  assert.equal(taskRows.rows[0].task_id,'task-a');
  assert.equal(taskRows.rows[0].record_json.description,'Renamed first task');

  await assert.rejects(storeB.create(updated),/already exists/i);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM baye_mission_tasks WHERE mission_id=$1',[initial.id])).rows[0].count,1);

  const token=updated.updatedAt;
  const contenderA={...updated,goal:'concurrent A',updatedAt:new Date(Date.parse(token)+1000).toISOString()};
  const contenderB={...updated,goal:'concurrent B',updatedAt:new Date(Date.parse(token)+2000).toISOString()};
  const outcomes=await Promise.allSettled([
   storeA.save(contenderA,{expectedUpdatedAt:token}),
   storeB.save(contenderB,{expectedUpdatedAt:token})
  ]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
  const persisted=await storeA.get(initial.id);
  assert.ok(['concurrent A','concurrent B'].includes(persisted.goal));
  const version=await pool.query('SELECT version FROM baye_missions WHERE mission_id=$1',[initial.id]);
  assert.equal(Number(version.rows[0].version),3);
 }finally{
  if(pool)await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS '+quotedSchema+' CASCADE').catch(()=>{});
  await admin.end();
 }
});
