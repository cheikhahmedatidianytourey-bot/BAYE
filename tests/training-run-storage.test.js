import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingRunStorageReady,getTrainingRunStorageStatus,initializeTrainingRunStorage,saveTrainingRunRecord,getStoredTrainingRun,listStoredTrainingRuns} from '../server/ai/training-run-storage.js';
test('storage status exposes persistence configuration and no execution',async()=>{const s=await getTrainingRunStorageStatus();assert.equal(s.executionEnabled,false);assert.equal(s.trainingStarted,false);assert.equal(s.configured,trainingRunStorageReady());});
test('database operations fail clearly without DATABASE_URL',async()=>{if(trainingRunStorageReady())return;await assert.rejects(initializeTrainingRunStorage(),/DATABASE_URL/);await assert.rejects(saveTrainingRunRecord({}),/DATABASE_URL/);await assert.rejects(getStoredTrainingRun('x'),/DATABASE_URL/);await assert.rejects(listStoredTrainingRuns(),/DATABASE_URL/);});
