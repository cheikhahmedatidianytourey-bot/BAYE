import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,validateMission,transitionMission,transitionTask} from './mission-engine.js';

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

test('mission pause and resume transitions preserve valid records',()=>{
 const m=createMission({goal:'pause recovery'});
 const running=transitionMission(m,'running');
 const paused=transitionMission(running,'paused');
 const resumed=transitionMission(paused,'running');
 assert.equal(resumed.status,'running');
 assert.equal(validateMission(resumed).valid,true);
 assert.throws(()=>transitionMission(m,'completed'),/Invalid mission state transition/);
});
test('task retry after failure retains attempt accounting and valid checkpoint',()=>{
 const m=createMission({goal:'retry recovery',tasks:[{id:'t',description:'task'}]});
 const started=transitionTask(m,'t','running');
 assert.equal(started.tasks[0].attempt,1);
 const failed=transitionTask(started,'t','failed',{error:'temporary failure'});
 const retryReady=transitionTask(failed,'t','pending');
 const restarted=transitionTask(retryReady,'t','running');
 assert.equal(restarted.tasks[0].attempt,2);
 assert.equal(restarted.checkpoint.completedTaskIds.length,0);
 assert.equal(validateMission(restarted).valid,true);
});
test('cancelled mission and task remain consistent and cannot be resumed illegally',()=>{
 const m=createMission({goal:'cancel recovery',tasks:[{id:'t',description:'task'}]});
 const cancelled=transitionMission(m,'cancelled');
 assert.equal(cancelled.status,'cancelled');
 assert.throws(()=>transitionMission(cancelled,'running'),/Invalid mission state transition/);
 const taskCancelled=transitionTask(m,'t','cancelled');
 assert.equal(taskCancelled.tasks[0].status,'cancelled');
 assert.equal(validateMission(taskCancelled).valid,true);
});
