import test from 'node:test';
import assert from 'node:assert/strict';
import {PostgresMissionStore} from './postgres-mission-store.js';

test('Postgres schema verification checks required mission and task columns without migrating',async()=>{
 const calls=[];
 const pool={query:async(sql)=>{calls.push(sql);return {rows:[]};},connect:async()=>{throw new Error('connect should not be used by schema verification');}};
 const store=new PostgresMissionStore({pool});
 assert.equal(await store.verifySchema(),true);
 assert.equal(calls.length,2);
 assert.match(calls[0],/FROM baye_missions LIMIT 0/);
 assert.match(calls[1],/FROM baye_mission_tasks LIMIT 0/);
 assert.ok(calls.every(sql=>/^SELECT/.test(sql)));
});

test('Postgres schema verification fails when required tables are unavailable',async()=>{
 const pool={query:async()=>{throw new Error('relation does not exist');},connect:async()=>{throw new Error('connect should not be used by schema verification');}};
 const store=new PostgresMissionStore({pool});
 await assert.rejects(store.verifySchema(),/relation does not exist/);
});