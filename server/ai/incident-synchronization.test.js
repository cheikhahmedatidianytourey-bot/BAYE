import test from 'node:test';
import assert from 'node:assert/strict';
import { synchronizeIncidents } from './incident-synchronization.js';

test('G73 restores persisted records before syncing tracker snapshots',async()=>{let restored=[];const saved=[];const result=await synchronizeIncidents({listStored:async()=>({items:[{id:'old',path:'/old',category:'timeout',severity:'major',status:'open'}]}),restoreTracked:records=>{restored=records;return {restored:records.length};},listTracked:()=>({items:[{id:'new',path:'/new',category:'network',severity:'minor',status:'open'}]}),saveRecord:async r=>{saved.push(r);return {status:'stored'};}});assert.equal(restored.length,1);assert.equal(saved.length,1);assert.equal(result.status,'synchronized');assert.equal(result.restored,1);assert.equal(result.saved,1);});

test('G73 reports bounded partial sync results',async()=>{const result=await synchronizeIncidents({max:3,listStored:async()=>({items:[]}),restoreTracked:()=>({restored:0}),listTracked:()=>({items:[{id:'a'},{id:'b'}]}),saveRecord:async r=>({status:r.id==='a'?'stored':'capacity'})});assert.equal(result.limit,3);assert.equal(result.status,'partial');assert.equal(result.saved,1);assert.equal(result.capacity,1);});

test('G73 rejects missing sync dependencies',async()=>{assert.equal((await synchronizeIncidents({})).status,'rejected');});
