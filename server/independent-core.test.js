import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMission,buildMissionPlan,getIndependentCoreStatus} from './independent-core.js';
test('classifies software tasks',()=>assert.equal(classifyMission('debug this API'),'engineering'));
test('classifies creative tasks',()=>assert.equal(classifyMission('create an image'),'creative'));
test('returns five stages and keeps execution disabled',()=>{const p=buildMissionPlan('Build a tool');assert.equal(p.steps.length,5);assert.equal(p.executionAvailable,false);assert.equal(p.verificationRequired,true);});
test('status exposes model runtime milestone',()=>assert.ok(getIndependentCoreStatus().modules.some(m=>m.id==='model_runtime')));
test('rejects empty mission',()=>assert.throws(()=>buildMissionPlan('')));
test('status does not claim a trained foundation model',()=>assert.equal(getIndependentCoreStatus().trainedFoundationModel,false));

import {runOwnedRuntime,tokenize} from './owned-runtime.js';
test('runtime handles a valid mission without providers',()=>{const r=runOwnedRuntime('Build an API');assert.equal(r.providerIndependent,true);assert.equal(r.executionAvailable,false);assert.equal(r.response.plan.length,5);});
test('tokenizer extracts words and numbers',()=>assert.deepEqual(tokenize('BAYE v0.1 core'),['baye','v0','1','core']));
test('runtime rejects blank input',()=>assert.throws(()=>runOwnedRuntime('  ')));
test('runtime rejects oversized input',()=>assert.throws(()=>runOwnedRuntime('x'.repeat(4001))));

import {MemoryEngine} from './memory-engine.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('memory engine stores, searches, and deletes an entry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-memory-test-'));
 try{
  const engine=new MemoryEngine({filePath:join(dir,'memory.json'),maxEntries:10});
  const saved=await engine.add({text:'BAYE memory prototype',tags:['core','test']});
  assert.equal((await engine.search('prototype')).length,1);
  assert.equal((await engine.search('core')).length,1);
  assert.equal(await engine.remove(saved.id),true);
  assert.equal((await engine.search('prototype')).length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('memory engine enforces input bounds',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-memory-test-'));
 try{
  const engine=new MemoryEngine({filePath:join(dir,'memory.json')});
  await assert.rejects(engine.add({text:'x'.repeat(4001)}));
  await assert.rejects(engine.add({text:''}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('memory engine caps retained entries',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baye-memory-test-'));
 try{
  const engine=new MemoryEngine({filePath:join(dir,'memory.json'),maxEntries:2});
  await engine.add({text:'one'});await engine.add({text:'two'});await engine.add({text:'three'});
  assert.equal((await engine.search()).length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
