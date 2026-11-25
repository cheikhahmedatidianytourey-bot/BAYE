import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,validateMission,transitionMission,transitionTask,getMissionEnginePhaseAStatus} from './mission-engine.js';

test('creates a validated mission with an initial queued state',()=>{
 const mission=createMission({goal:'Build a resilient platform'});
 assert.equal(mission.status,'queued');
 assert.equal(validateMission(mission).valid,true);
});
test('supports many tasks without an arbitrary mission-wide task cap',()=>{
 const tasks=Array.from({length:1500},(_,i)=>({description:'task '+i}));
 const mission=createMission({goal:'large mission',tasks});
 assert.equal(mission.tasks.length,1500);
 assert.equal(validateMission(mission).taskCount,1500);
});
test('rejects duplicate task identifiers and unknown dependencies',()=>{
 assert.throws(()=>createMission({goal:'bad',tasks:[{id:'x',description:'one'},{id:'x',description:'two'}]}),/duplicate task ID/);
 assert.throws(()=>createMission({goal:'bad',tasks:[{id:'x',description:'one',dependencies:['missing']}]}),/unknown task/);
});
test('validates mission status transitions and prevents invalid ones',()=>{
 const m=createMission({goal:'state test'});
 const running=transitionMission(m,'running');
 assert.equal(running.status,'running');
 assert.throws(()=>transitionMission(m,'completed'),/Invalid mission state transition/);
});
test('task checkpoint records completion and allows state progression',()=>{
 let m=createMission({goal:'checkpoint',tasks:[{id:'t1',description:'task one'}]});
 m=transitionMission(m,'running');
 m=transitionTask(m,'t1','running');
 m=transitionTask(m,'t1','completed',{resultRef:'result-1'});
 assert.deepEqual(m.checkpoint.completedTaskIds,['t1']);
 assert.equal(m.tasks[0].resultRef,'result-1');
 assert.equal(validateMission(m).valid,true);
});
test('task transitions reject invalid transition attempts',()=>{
 const m=createMission({goal:'test',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>transitionTask(m,'t','completed'),/Invalid task state transition/);
});
test('Phase A status is honest about persistence being absent',()=>{
 assert.equal(getMissionEnginePhaseAStatus().persistence,'not implemented in Phase A');
});
