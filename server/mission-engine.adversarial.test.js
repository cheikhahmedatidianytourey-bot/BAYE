import test from 'node:test';
import assert from 'node:assert/strict';
import {createMission,validateMission,transitionMission,transitionTask} from './mission-engine.js';

test('adversarial mission validation: empty, malformed, and oversized goals/constraints',()=>{
 assert.throws(()=>createMission({goal:'   '}),/goal/i);
 assert.throws(()=>createMission({goal:'bad constraints',constraints:[]}),/constraints/i);
 assert.throws(()=>createMission({goal:'oversize constraints',constraints:{blob:'x'.repeat(70000)}}),/size limit/i);
});

test('iterative cycle validation handles a deep acyclic graph without recursion',()=>{
 const tasks=Array.from({length:3000},(_,i)=>({id:'node-'+i,description:'task '+i,dependencies:i?['node-'+(i-1)]:[]}));
 const mission=createMission({goal:'deep graph',tasks});
 assert.equal(validateMission(mission).taskCount,3000);
});

test('deep cycle is detected without recursion',()=>{
 const tasks=Array.from({length:3000},(_,i)=>({id:'node-'+i,description:'task '+i,dependencies:[i? 'node-'+(i-1):'node-2999']}));
 assert.throws(()=>createMission({goal:'deep cycle',tasks}),/cycle/i);
});

test('prototype-like IDs remain valid identifiers in mission graph',()=>{
 const mission=createMission({goal:'prototype identifiers',tasks:[
  {id:'__proto__',description:'one'},
  {id:'constructor',description:'two',dependencies:['__proto__']},
  {id:'toString',description:'three',dependencies:['constructor']}
 ]});
 assert.equal(validateMission(mission).valid,true);
});

test('duplicate and self dependency lists are rejected',()=>{
 assert.throws(()=>createMission({goal:'duplicate deps',tasks:[{id:'a',description:'A',dependencies:['b','b']},{id:'b',description:'B'}]}),/dependencies/i);
 assert.throws(()=>createMission({goal:'self dep',tasks:[{id:'a',description:'A',dependencies:['a']}]}),/depend on itself/i);
});

test('checkpoint consistency rejects missing and extra completed task IDs',()=>{
 const mission=createMission({goal:'checkpoint consistency',tasks:[{id:'t',description:'task'}]});
 assert.throws(()=>validateMission({...mission,checkpoint:{completedTaskIds:['t'],lastTaskId:'t'}}),/Checkpoint/i);
 assert.throws(()=>validateMission({...mission,checkpoint:{completedTaskIds:['ghost'],lastTaskId:null}}),/Checkpoint/i);
});

test('timestamps, owner, task attempts and retry record are validated',()=>{
 const mission=createMission({goal:'invalid fields'});
 assert.throws(()=>validateMission({...mission,createdAt:'not-a-date'}),/timestamps/i);
 assert.throws(()=>validateMission({...mission,ownerRef:17}),/ownerRef/i);
 assert.throws(()=>validateMission({...mission,retry:{attempt:-1,lastError:null,nextRetryAt:null}}),/retry/i);
});

test('state machine rejects invalid and malformed transitions without mutation',()=>{
 const mission=createMission({goal:'state safety'});
 assert.throws(()=>transitionMission(mission,'completed'),/transition/i);
 assert.equal(mission.status,'queued');
 assert.throws(()=>transitionTask(mission,'missing','running'),/not found/i);
});

test('audit and approval collections have enforceable limits',()=>{
 const mission=createMission({goal:'bounded metadata'});
 assert.throws(()=>validateMission({...mission,audit:Array(10001).fill({event:'x',at:mission.createdAt})}),/audit|approvals/i);
 assert.throws(()=>validateMission({...mission,approvals:Array(1001).fill({})}),/audit|approvals/i);
});
