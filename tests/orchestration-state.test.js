import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskState,transitionTaskState,getTaskStateTransitions} from '../server/orchestration-state.js';

test('creates a pending task with immutable empty history',()=>{
 const state=createTaskState('research_1');
 assert.equal(state.status,'pending');
 assert.equal(state.revision,0);
 assert.deepEqual(state.history,[]);
 assert.equal(Object.isFrozen(state),true);
});
test('enforces the normal lifecycle and records ordered transition receipts',()=>{
 let state=createTaskState('task-1');
 state=transitionTaskState(state,'ready');
 state=transitionTaskState(state,'running');
 state=transitionTaskState(state,'succeeded');
 assert.equal(state.status,'succeeded');
 assert.equal(state.revision,3);
 assert.deepEqual(state.history.map(x=>[x.from,x.to,x.revision]),[
  ['pending','ready',1],['ready','running',2],['running','succeeded',3]
 ]);
 assert.equal(Object.isFrozen(state.history),true);
});
test('requires reasons for failure and cancellation',()=>{
 const ready=transitionTaskState(createTaskState('task-2'),'ready');
 const running=transitionTaskState(ready,'running');
 assert.throws(()=>transitionTaskState(running,'failed'),/motif valide/);
 assert.throws(()=>transitionTaskState(ready,'cancelled'),/motif valide/);
 assert.equal(transitionTaskState(running,'failed',{reason:'provider_timeout'}).status,'failed');
});
test('rejects illegal transitions and terminal-state reopening',()=>{
 const pending=createTaskState('task-3');
 assert.throws(()=>transitionTaskState(pending,'running'),/Transition interdite/);
 const done=transitionTaskState(transitionTaskState(transitionTaskState(pending,'ready'),'running'),'succeeded');
 assert.throws(()=>transitionTaskState(done,'ready'),/Transition interdite/);
 assert.throws(()=>transitionTaskState(done,'cancelled',{reason:'late'}),/Transition interdite/);
});
test('rejects malformed state, status, task ID and unexpected options',()=>{
 assert.throws(()=>createTaskState('../escape'),/Identifiant/);
 assert.throws(()=>transitionTaskState(null,'ready'),/État/);
 assert.throws(()=>transitionTaskState(createTaskState('x'),'unknown'),/inconnu/);
 assert.throws(()=>transitionTaskState(createTaskState('x'),'cancelled',{force:true}),/non autorisée/);
 assert.throws(()=>transitionTaskState(createTaskState('x'),'cancelled',{reason:' '.repeat(3)}),/motif valide/);
});
test('publishes a closed transition allowlist',()=>{
 const map=getTaskStateTransitions();
 assert.deepEqual(map.pending,['ready','cancelled']);
 assert.deepEqual(map.running,['succeeded','failed','cancelled']);
 assert.deepEqual(map.succeeded,[]);
});
