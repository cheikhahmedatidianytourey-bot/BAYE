import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMission,buildMissionPlan,getIndependentCoreStatus} from './independent-core.js';
test('classifies software tasks',()=>assert.equal(classifyMission('debug this API'),'engineering'));
test('classifies creative tasks',()=>assert.equal(classifyMission('create an image'),'creative'));
test('returns five stages and keeps execution disabled',()=>{const p=buildMissionPlan('Build a tool');assert.equal(p.steps.length,5);assert.equal(p.executionAvailable,false);assert.equal(p.verificationRequired,true);});\ntest('status exposes model runtime milestone',()=>assert.ok(getIndependentCoreStatus().modules.some(m=>m.id==='model_runtime')));
test('rejects empty mission',()=>assert.throws(()=>buildMissionPlan('')));
test('status does not claim a trained foundation model',()=>assert.equal(getIndependentCoreStatus().trainedFoundationModel,false));
