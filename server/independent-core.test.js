import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMission,buildMissionPlan,getIndependentCoreStatus} from './independent-core.js';
test('classifies software tasks',()=>assert.equal(classifyMission('debug this API'),'engineering'));
test('classifies creative tasks',()=>assert.equal(classifyMission('create an image'),'creative'));
test('returns five plan stages',()=>assert.equal(buildMissionPlan('Build a tool').steps.length,5));
test('rejects empty mission',()=>assert.throws(()=>buildMissionPlan('')));
test('status does not claim a trained foundation model',()=>assert.equal(getIndependentCoreStatus().trainedFoundationModel,false));
