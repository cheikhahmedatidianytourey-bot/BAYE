import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresMissionStore} from './postgres-mission-store.js';
import {createMission} from './mission-engine.js';

function fakePool({lockedRecord=null,updateRowCount=1}={}){
 const calls=[];let released=false;
 const client={query:async(sql,params=[])=>{calls.push({sql,params});if(sql.startsWith('SELECT version'))return {rows:lockedRecord?[{version:1,record_json:lockedRecord}]:[]};if(sql.startsWith('UPDATE'))return {rowCount:updateRowCount};return {rows:[]};},release:()=>{released=true;}};
 const pool={calls,client,get released(){return released;},query:async(sql,params=[])=>{calls.push({sql,params});return {rows:[]};},connect:async()=>client};
 return pool;
}
const mission=()=>createMission({goal:'Postgres adapter test',ownerRef:'user-1',constraints:{scope:'test'},tasks:[{id:'task-1',description:'Test adapter'}]});

test('Postgres store validates pool dependency',()=>assert.throws(()=>new PostgresMissionStore(),/pool/i));
test('Postgres create persists canonical record and maps duplicate key',async()=>{
 const pool=fakePool();const store=new PostgresMissionStore({pool});const record=mission();
 assert.deepEqual(await store.create(record),record);
 assert.match(pool.calls[0].sql,/INSERT INTO baye_missions/);
 assert.equal(pool.calls[0].params[0],record.id);
 const duplicatePool=fakePool();duplicatePool.query=async()=>{throw Object.assign(new Error('duplicate'),{code:'23505'});};
 await assert.rejects(new PostgresMissionStore({pool:duplicatePool}).create(record),/already exists/i);
});
test('Postgres save uses row lock and commits successful update',async()=>{
 const initial=mission();const pool=fakePool({lockedRecord:initial});const store=new PostgresMissionStore({pool});
 const update={...initial,goal:'updated',updatedAt:new Date(Date.parse(initial.updatedAt)+1000).toISOString()};
 await store.save(update,{expectedUpdatedAt:initial.updatedAt});
 assert.ok(pool.calls.some(call=>/FOR UPDATE/.test(call.sql)));
 assert.ok(pool.calls.some(call=>call.sql==='COMMIT'));
 assert.equal(pool.released,true);
});
test('Postgres save rejects stale token and rolls back',async()=>{
 const initial=mission();const pool=fakePool({lockedRecord:initial});const store=new PostgresMissionStore({pool});
 const stale={...initial,goal:'stale',updatedAt:new Date(Date.parse(initial.updatedAt)+2000).toISOString()};
 await assert.rejects(store.save(stale,{expectedUpdatedAt:'2000-01-01T00:00:00.000Z'}),/stale/i);
 assert.ok(pool.calls.some(call=>call.sql==='ROLLBACK'));
 assert.equal(pool.released,true);
});
test('Postgres get and list validate returned mission records',async()=>{
 const record=mission();let count=0;const pool=fakePool();
 pool.query=async(sql)=>{count++;return {rows:sql.includes('WHERE mission_id')?[{record_json:record}]:[{record_json:record}]};};
 const store=new PostgresMissionStore({pool});
 assert.deepEqual(await store.get(record.id),record);
 assert.deepEqual(await store.list(),[record]);assert.equal(count,2);
});
