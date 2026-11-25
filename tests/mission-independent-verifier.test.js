import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMissionExecution} from '../server/mission-independent-verifier.js';
const tasks=[{id:'research',dependsOn:[]},{id:'quality',dependsOn:['research']}];
const results=[{taskId:'research',status:'succeeded',output:{content:'Analysis'}},{taskId:'quality',status:'succeeded',output:{content:'Review'}}];
const states={research:{status:'succeeded'},quality:{status:'succeeded'}};
test('independent verifier accepts complete traceable specialist output',()=>{
 const r=verifyMissionExecution({tasks,results,taskStates:states});
 assert.equal(r.status,'integrity_passed');
 assert.equal(r.checks.factualAccuracy,false);
});
test('blocks missing results and missing dependency trace',()=>{
 const r=verifyMissionExecution({tasks,results:[results[1]],taskStates:{quality:{status:'succeeded'}}});
 assert.equal(r.status,'blocked');
 assert.ok(r.findings.some(x=>x.code==='MISSING_RESULT'));
 assert.ok(r.findings.some(x=>x.code==='DEPENDENCY_RESULT_MISSING'));
});
test('blocks state mismatches, empty content and oversized output',()=>{
 const r=verifyMissionExecution({tasks:[{id:'x',dependsOn:[]}],results:[{taskId:'x',status:'succeeded',output:{content:''}}],taskStates:{x:{status:'running'}}});
 assert.equal(r.status,'blocked');
 assert.ok(r.findings.some(x=>x.code==='EMPTY_OUTPUT'));
 assert.ok(r.findings.some(x=>x.code==='STATE_NOT_CONFIRMED'));
 const large=verifyMissionExecution({tasks:[{id:'x',dependsOn:[]}],results:[{taskId:'x',status:'succeeded',output:{content:'a'.repeat(50001)}}],taskStates:{x:{status:'succeeded'}}});
 assert.ok(large.findings.some(x=>x.code==='OUTPUT_TOO_LARGE'));
});
test('blocks unexpected and duplicate result identifiers',()=>{
 const r=verifyMissionExecution({tasks:[{id:'x',dependsOn:[]}],results:[{taskId:'x',status:'succeeded',output:{content:'x'}},{taskId:'x',status:'succeeded',output:{content:'duplicate'}},{taskId:'other',status:'succeeded',output:{content:'unexpected'}}],taskStates:{x:{status:'succeeded'}}});
 assert.ok(r.findings.some(x=>x.code==='DUPLICATE_OR_INVALID_RESULT'));
 assert.ok(r.findings.some(x=>x.code==='UNEXPECTED_RESULT'));
 assert.equal(r.status,'blocked');
});
test('reports malformed plans as blocked',()=>{
 const r=verifyMissionExecution({tasks:[],results:[],taskStates:{}});
 assert.equal(r.status,'blocked');
 assert.equal(r.checks.planShape,false);
});
