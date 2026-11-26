import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPostgresPool,readPostgresPoolConfig} from './postgres-pool.js';

const localEnv={BAYE_POSTGRES_ENABLED:'true',BAYE_DATABASE_URL:'postgres://user:secret@localhost:5432/baye'};

test('PostgreSQL pool is disabled unless explicitly enabled',()=>{
 assert.deepEqual(readPostgresPoolConfig({}),{enabled:false});
 assert.equal(createPostgresPool({env:{}}),null);
});

test('enabled pool requires a valid PostgreSQL URL',()=>{
 assert.throws(()=>readPostgresPoolConfig({BAYE_POSTGRES_ENABLED:'true'}),/BAYE_DATABASE_URL is required/);
 assert.throws(()=>readPostgresPoolConfig({BAYE_POSTGRES_ENABLED:'true',BAYE_DATABASE_URL:'https://example.com'}),/postgres/);
 assert.throws(()=>readPostgresPoolConfig({BAYE_POSTGRES_ENABLED:'true',BAYE_DATABASE_URL:'not a url'}),/valid PostgreSQL/);
});

test('remote PostgreSQL requires explicit verified TLS',()=>{
 const env={...localEnv,BAYE_DATABASE_URL:'postgres://user:secret@db.example.com:5432/baye'};
 assert.throws(()=>readPostgresPoolConfig(env),/BAYE_DATABASE_SSL=true/);
 const config=readPostgresPoolConfig({...env,BAYE_DATABASE_SSL:'true'});
 assert.deepEqual(config.ssl,{rejectUnauthorized:true});
 assert.equal(config.connectionTimeoutMillis,10000);
 assert.equal(config.idleTimeoutMillis,30000);
});

test('pool limits are bounded and connection URL sslmode is rejected',()=>{
 assert.throws(()=>readPostgresPoolConfig({...localEnv,BAYE_PG_POOL_MAX:'0'}),/between 1 and 20/);
 assert.throws(()=>readPostgresPoolConfig({...localEnv,BAYE_PG_POOL_MAX:'21'}),/between 1 and 20/);
 assert.throws(()=>readPostgresPoolConfig({...localEnv,BAYE_DATABASE_URL:localEnv.BAYE_DATABASE_URL+'?sslmode=disable'}),/Remove sslmode/);
 assert.equal(readPostgresPoolConfig({...localEnv,BAYE_PG_POOL_MAX:'8'}).max,8);
});

test('pool factory reports sanitized errors and closes idempotently',async()=>{
 class FakePool extends EventEmitter{
  constructor(config){super();this.config=config;this.endCalls=0;}
  async end(){this.endCalls++;}
 }
 const reports=[];
 const lifecycle=createPostgresPool({env:localEnv,PoolClass:FakePool,onPoolError:report=>reports.push(report)});
 assert.equal(lifecycle.pool.config.max,5);
 lifecycle.pool.emit('error',Object.assign(new Error('secret connection string must not leak'),{code:'ECONNRESET'}));
 assert.deepEqual(reports,[{code:'ECONNRESET'}]);
 const first=lifecycle.close();
 const second=lifecycle.close();
 assert.equal(first,second);
 await first;
 assert.equal(lifecycle.pool.endCalls,1);
});
