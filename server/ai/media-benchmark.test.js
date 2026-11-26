import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMediaBenchmarkRecord,scoreMediaBenchmarkRecord,createMediaBenchmarkRecord} from './media-benchmark.js';

const valid={benchmarkId:'baye-media-v1',provider:'example',model:'model-x',modality:'image',promptId:'scene-01',trial:1,latencyMs:1250,scores:{promptAdherence:4,photorealism:5,physicalPlausibility:4,temporalConsistency:4,artifactControl:3}};

test('validates a fully scored media trial',()=>assert.equal(validateMediaBenchmarkRecord(valid).valid,true));
test('computes a transparent arithmetic mean from human scores',()=>assert.deepEqual(scoreMediaBenchmarkRecord(valid).score,4));
test('rejects invalid score values and missing metadata',()=>{const result=validateMediaBenchmarkRecord({...valid,model:'',scores:{...valid.scores,photorealism:6}});assert.equal(result.valid,false);assert.ok(result.errors.some(e=>e.includes('model')));assert.ok(result.errors.some(e=>e.includes('photorealism')));});
test('rejects unknown modality and invalid trial count',()=>{const result=validateMediaBenchmarkRecord({...valid,modality:'audio',trial:0});assert.equal(result.valid,false);});
test('record helper attaches scoring summary without media or credentials',()=>{const record=createMediaBenchmarkRecord(valid);assert.equal(record.scoreSummary.score,4);assert.equal(record.scoreSummary.humanReviewed,true);});
test('scoring refuses invalid records',()=>assert.throws(()=>scoreMediaBenchmarkRecord({...valid,scores:{...valid.scores,artifactControl:0}}),{code:'MEDIA_BENCHMARK_INVALID_RECORD'}));
