// BAYE V6 G11 — explicit runtime selection for mission persistence.
import {MissionStore} from './mission-store.js';
import {PostgresMissionStore} from './postgres-mission-store.js';
import {createPostgresPool} from './postgres-pool.js';

export async function createConfiguredMissionStore({
 env=process.env,
 poolFactory=createPostgresPool,
 filesystemStoreFactory=options=>new MissionStore(options),
 postgresStoreFactory=options=>new PostgresMissionStore(options)
}={}){
 if(env.BAYE_POSTGRES_ENABLED!=='true'){
  const store=filesystemStoreFactory({directory:env.BAYE_MISSION_DIRECTORY||'/var/data/baye-missions'});
  await store.init();
  return {backend:'filesystem',store,close:async()=>{}};
 }

 const lifecycle=poolFactory({env,onPoolError:({code})=>console.error('BAYE PostgreSQL pool error',code)});
 if(!lifecycle?.pool||typeof lifecycle.close!=='function'){
  throw new Error('BAYE PostgreSQL is enabled but its connection pool could not be created.');
 }
 try{
  const store=postgresStoreFactory({pool:lifecycle.pool});
  await store.init();
  await store.verifySchema();
  return {backend:'postgres',store,close:()=>lifecycle.close()};
 }catch{
  await lifecycle.close().catch(()=>{});
  throw new Error('BAYE PostgreSQL mission storage could not be initialized. Check database connectivity and ensure the schema migrations have already been applied.');
 }
}
