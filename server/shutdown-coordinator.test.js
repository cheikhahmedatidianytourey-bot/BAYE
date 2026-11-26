import test from 'node:test';
import assert from 'node:assert/strict';
import {createShutdownCoordinator} from './shutdown-coordinator.js';

test('shutdown closes HTTP before storage and is idempotent',async()=>{
 const events=[];
 const server={close:cb=>{events.push('http');cb();}};
 const closeStorage=async()=>events.push('storage');
 const shutdown=createShutdownCoordinator({server,closeStorage,logger:{log(){},error(){}}});
 await Promise.all([shutdown('SIGTERM'),shutdown('SIGINT')]);
 assert.deepEqual(events,['http','storage']);
});

test('storage cleanup runs even when HTTP close errors',async()=>{
 let storageClosed=false,forced=false;
 const server={close:cb=>cb(new Error('close failure')),closeAllConnections:()=>{forced=true;}};
 const shutdown=createShutdownCoordinator({server,closeStorage:async()=>{storageClosed=true;},logger:{log(){},error(){}}});
 await assert.rejects(shutdown('SIGTERM'),/not clean/);
 assert.equal(forced,true);assert.equal(storageClosed,true);
});

test('shutdown timeout triggers force close and still closes storage',async()=>{
 let forced=false,storageClosed=false;
 const server={close(){},closeAllConnections(){forced=true;}};
 const shutdown=createShutdownCoordinator({server,closeStorage:async()=>{storageClosed=true;},timeoutMs:10,logger:{log(){},error(){}}});
 await assert.rejects(shutdown('SIGTERM'),/not clean/);
 assert.equal(forced,true);assert.equal(storageClosed,true);
});

test('shutdown rejects invalid inputs',()=>{
 assert.throws(()=>createShutdownCoordinator({server:null,closeStorage(){}}),/HTTP server/);
 assert.throws(()=>createShutdownCoordinator({server:{close(){}},closeStorage:null}),/Storage close/);
});
