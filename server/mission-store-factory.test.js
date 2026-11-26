import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguredMissionStore} from './mission-store-factory.js';

test('filesystem storage remains the default and does not create a PostgreSQL pool',async()=>{
 let initialized=false;
 const store={init:async()=>{initialized=true;return store;}};
 const handle=await createConfiguredMissionStore({
  env:{BAYE_MISSION_DIRECTORY:'/tmp/baye-test-missions'},
  filesystemStoreFactory:options=>{assert.equal(options.directory,'/tmp/baye-test-missions');return store;},
  poolFactory:()=>{throw new Error('pool must not be created');}
 });
 assert.equal(handle.backend,'filesystem');
 assert.equal(handle.store,store);
 assert.equal(initialized,true);
 await handle.close();
});

test('explicit PostgreSQL mode initializes the adapter and verifies its schema',async()=>{
 const events=[];
 const pool={query:async()=>{}};
 const handle=await createConfiguredMissionStore({
  env:{BAYE_POSTGRES_ENABLED:'true',BAYE_DATABASE_URL:'postgres://localhost/baye'},
  poolFactory:({env})=>{assert.equal(env.BAYE_POSTGRES_ENABLED,'true');return {pool,close:async()=>events.push('closed')};},
  postgresStoreFactory:({pool:received})=>{
   assert.equal(received,pool);
   return {init:async()=>events.push('initialized'),verifySchema:async()=>events.push('schema-verified')};
  }
 });
 assert.equal(handle.backend,'postgres');
 assert.deepEqual(events,['initialized','schema-verified']);
 await handle.close();
 assert.deepEqual(events,['initialized','schema-verified','closed']);
});

test('PostgreSQL startup fails closed and closes the pool when schema verification fails',async()=>{
 let closed=false;
 await assert.rejects(createConfiguredMissionStore({
  env:{BAYE_POSTGRES_ENABLED:'true'},
  poolFactory:()=>({pool:{},close:async()=>{closed=true;}}),
  postgresStoreFactory:()=>({init:async()=>{},verifySchema:async()=>{throw new Error('missing table');}})
 }),/schema migrations have already been applied/);
 assert.equal(closed,true);
});

test('PostgreSQL mode rejects an unavailable pool lifecycle',async()=>{
 await assert.rejects(createConfiguredMissionStore({
  env:{BAYE_POSTGRES_ENABLED:'true'},
  poolFactory:()=>null
 }),/pool could not be created/);
});
