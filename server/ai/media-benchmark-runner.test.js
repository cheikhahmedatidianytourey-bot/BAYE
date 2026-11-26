import test from 'node:test';
import assert from 'node:assert/strict';
import {planMediaBenchmark,executeMediaBenchmarkPlan} from './media-benchmark-runner.js';

const dataset={version:'test-1',prompts:[{id:'i1',modality:'image',category:'test',prompt:'image prompt'},{id:'v1',modality:'video',category:'test',prompt:'video prompt'}]};

test('plans modality-specific calls and bounds total calls',()=>{assert.equal(planMediaBenchmark(dataset,{modality:'image'}).totalCalls,1);assert.equal(planMediaBenchmark(dataset,{trialsPerPrompt:2,maxCalls:4}).totalCalls,4);});
test('rejects plans that exceed the bounded call budget',()=>assert.throws(()=>planMediaBenchmark(dataset,{trialsPerPrompt:6}),/exceeds maxCalls/));
test('rejects execution without explicit opt-in before calling provider',async()=>{let calls=0;await assert.rejects(()=>executeMediaBenchmarkPlan(planMediaBenchmark(dataset,{modality:'image'}),{generate:async()=>calls++}),{code:'MEDIA_BENCHMARK_OPT_IN_REQUIRED'});assert.equal(calls,0);});
test('executes mocked trials and summarizes safely',async()=>{const plan=planMediaBenchmark(dataset,{modality:'image'});const result=await executeMediaBenchmarkPlan(plan,{optIn:true,provider:'mock',model:'test-model',generate:async()=>({latencyMs:12,outputAvailable:true,media:'not persisted'})});assert.equal(result.completedCalls,1);assert.equal(result.failedCalls,0);assert.equal(result.trials[0].outputAvailable,true);assert.equal(JSON.stringify(result).includes('not persisted'),false);});
test('records adapter failures without exposing error messages',async()=>{const plan=planMediaBenchmark(dataset,{modality:'image'});const result=await executeMediaBenchmarkPlan(plan,{optIn:true,provider:'mock',model:'test-model',generate:async()=>{const e=new Error('secret details');e.code='TEST_FAILURE';throw e;}});assert.equal(result.failedCalls,1);assert.equal(result.trials[0].errorCode,'TEST_FAILURE');assert.equal(JSON.stringify(result).includes('secret details'),false);});
test('requires adapter and provider/model metadata',async()=>{const plan=planMediaBenchmark(dataset,{modality:'image'});await assert.rejects(()=>executeMediaBenchmarkPlan(plan,{optIn:true,provider:'mock',model:'x'}),/generate/);await assert.rejects(()=>executeMediaBenchmarkPlan(plan,{optIn:true,generate:async()=>{}}),/provider and model identifiers/);});
test('rejects unsafe plans at execution time',async()=>{await assert.rejects(()=>executeMediaBenchmarkPlan({prompts:[],totalCalls:11},{optIn:true,provider:'mock',model:'m',generate:async()=>{}}),/Invalid or unsafe/);});
