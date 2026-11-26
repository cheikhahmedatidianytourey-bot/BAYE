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
 assert.throws(()=>validateMission({...m,tasks:[{id:'t',description:'task',status:'pending',dependencies:[],order:0,attempt:0,resultRef:null,error:42,createdAt:m.createdAt,updatedAt:m.updatedAt}]}),/Invalid task error/);
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

test('mission transition rejects invalid state and preserves record integrity',()=>{
 const m=createMission({goal:'transition checks',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>validateMission({...m,status:'unknown'}),/Invalid mission status/);
 assert.throws(()=>validateMission({...m,updatedAt:'bad'}),/mission timestamps/);
});
test('checkpoint cannot claim a task completion before task state is completed',()=>{
 const m=createMission({goal:'checkpoint transition',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>validateMission({...m,checkpoint:{completedTaskIds:['t'],lastTaskId:'t'}}),/Checkpoint completed-task list is inconsistent/);
});
test('audit entries require event strings and valid timestamps',()=>{
 const m=createMission({goal:'audit transition'});
 assert.throws(()=>validateMission({...m,audit:[{event:7,at:m.createdAt}]}),/Invalid audit or approvals/);
 assert.throws(()=>validateMission({...m,audit:[{event:'test',at:'bad'}]}),/Invalid audit or approvals/);
});
