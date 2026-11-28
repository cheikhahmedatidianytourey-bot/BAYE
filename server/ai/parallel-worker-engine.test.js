import test from 'node:test';
import assert from 'node:assert/strict';
import {runParallelWorkerBatch,validateWorkerBatch,getParallelWorkerEngineStatus} from './parallel-worker-engine.js';
test('executes injected tasks and returns results in input order',async()=>{const r=await runParallelWorkerBatch({tasks:[{id:'a',title:'A'},{id:'b',title:'B'}],concurrency:2},async t=>t.id.toUpperCase());assert.equal(r.status,'completed');assert.deepEqual(r.results.map(x=>x.result),['A','B']);});
test('captures task failures without aborting remaining tasks',async()=>{const r=await runParallelWorkerBatch({tasks:[{id:'a',title:'A'},{id:'b',title:'B'}]},async t=>{if(t.id==='a')throw Error('boom');return 'ok';});assert.equal(r.status,'completed_with_failures');assert.equal(r.results[0].status,'failed');assert.equal(r.results[1].result,'ok');});
test('rejects invalid batch and executor',async()=>{assert.equal(validateWorkerBatch([]).status,'rejected');assert.equal((await runParallelWorkerBatch({tasks:[{id:'x',title:'x'}]},null)).status,'rejected');});
test('rejects concurrency outside bounds and duplicate IDs',async()=>{assert.equal((await runParallelWorkerBatch({tasks:[{id:'x',title:'x'}],concurrency:5},async()=>1)).status,'rejected');assert.equal(validateWorkerBatch([{id:'x',title:'x'},{id:'x',title:'y'}]).status,'rejected');});
test('reports bounded safe engine configuration',()=>{const s=getParallelWorkerEngineStatus();assert.equal(s.limits.maxConcurrency,4);assert.equal(s.networkAccess,false);assert.equal(s.repositoryAccess,false);});
