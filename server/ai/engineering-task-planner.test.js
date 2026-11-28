import test from 'node:test';
import assert from 'node:assert/strict';
import {planEngineeringTasks,getEngineeringPlannerStatus} from './engineering-task-planner.js';
test('groups independent tasks then dependent tasks',()=>{const r=planEngineeringTasks({tasks:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C',dependencies:['a','b']}]});assert.equal(r.status,'planned');assert.deepEqual(r.batches.map(x=>x.map(t=>t.id)),[['a','b'],['c']]);});
test('rejects malformed tasks and duplicates',()=>{assert.equal(planEngineeringTasks({tasks:[]}).status,'rejected');assert.match(planEngineeringTasks({tasks:[{id:'x',title:'x'},{id:'x',title:'duplicate'}]}).error,/Duplicate/);});
test('rejects unknown dependencies and cycles',()=>{assert.match(planEngineeringTasks({tasks:[{id:'a',title:'A',dependencies:['missing']}]}).error,/Unknown/);assert.match(planEngineeringTasks({tasks:[{id:'a',title:'A',dependencies:['b']},{id:'b',title:'B',dependencies:['a']}]}).error,/cycle/i);});
test('enforces task cap and reports disabled execution',()=>{const tasks=Array.from({length:101},(_,i)=>({id:String(i),title:'t'}));assert.equal(planEngineeringTasks({tasks}).status,'rejected');assert.equal(getEngineeringPlannerStatus().executionEnabled,false);});
