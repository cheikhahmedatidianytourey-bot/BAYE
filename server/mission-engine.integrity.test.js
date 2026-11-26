import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,validateMission} from './mission-engine.js';

test('rejects invalid and non-string timestamps throughout mission and tasks',()=>{
 const m=createMission({goal:'timestamp checks',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>validateMission({...m,createdAt:'not-a-date'}),/timestamps/);
 assert.throws(()=>validateMission({...m,tasks:[{...m.tasks[0],updatedAt:'invalid'}]}),/timestamps/);
});
test('rejects task errors with non-string values and invalid retry counters',()=>{
 const m=createMission({goal:'record integrity'});
 assert.throws(()=>validateMission({...m,retry:{attempt:-1,lastError:null,nextRetryAt:null}}),/retry/);
 assert.throws(()=>validateMission({...m,tasks:[{id:'t',description:'task',status:'pending',dependencies:[],order:0,attempt:0,resultRef:null,error:42,createdAt:m.createdAt,updatedAt:m.updatedAt}]}),/task record/);
});
test('rejects inconsistent checkpoint when a task is not completed',()=>{
 const m=createMission({goal:'checkpoint integrity',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>validateMission({...m,checkpoint:{completedTaskIds:['t'],lastTaskId:'t'}}),/Checkpoint/);
});
test('rejects duplicate dependency entries',()=>{
 assert.throws(()=>createMission({goal:'dependency integrity',tasks:[{id:'a',description:'A'},{id:'b',description:'B',dependencies:['a','a']}]}),/Invalid task dependencies/);
});
test('rejects malformed audit entries and oversized constraints',()=>{
 const m=createMission({goal:'audit integrity'});
 assert.throws(()=>validateMission({...m,audit:[{event:'bad',at:'not-a-date'}]}),/audit/);
 assert.throws(()=>createMission({goal:'size limit',constraints:{payload:'x'.repeat(70000)}}),/size limit/);
});

