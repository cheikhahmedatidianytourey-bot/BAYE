import test from 'node:test';
import assert from 'node:assert/strict';
import {createMissionCheckpoint} from '../server/mission-checkpoint.js';
import {planMissionRecovery} from '../server/mission-recovery.js';

const missionId='mission_1',graphDigest='sha256:abcd1234';
const graph={tasks:[
 {id:'research',dependsOn:[]},
 {id:'qa',dependsOn:['research']},
 {id:'final',dependsOn:['qa']}
]};
const checkpoint=(tasks,status='running')=>createMissionCheckpoint({missionId,graphDigest,tasks,status,updatedAt:'2026-11-23T18:00:00.000Z'});
test('preserves completed work and makes only dependency-ready tasks resumable',()=>{
 const plan=planMissionRecovery({checkpoint:checkpoint({research:{status:'succeeded',attempt:1,output:{answer:'ok'}},qa:{status:'pending',attempt:0,history:[]}}),graph,missionId,graphDigest});
 assert.equal(plan.status,'ready');
 assert.equal(plan.decisions.research.status,'completed');
 assert.equal(plan.decisions.qa.status,'ready');
 assert.equal(plan.decisions.final.status,'blocked');
 assert.deepEqual(plan.summary,{total:3,completed:1,ready:1,needsReview:0,blocked:1});
 assert.equal(plan.execution.workersInvoked,0);
});
test('does not replay a task left running by a previous process',()=>{
 const plan=planMissionRecovery({checkpoint:checkpoint({research:{status:'running',attempt:1},qa:{status:'pending',attempt:0,history:[]}}),graph,missionId,graphDigest});
 assert.equal(plan.decisions.research.status,'needs_review');
 assert.equal(plan.decisions.qa.status,'blocked');
 assert.equal(plan.safety.uncertainAttemptsReplayed,false);
});
test('does not automatically retry failed or cancelled tasks',()=>{
 for(const status of ['failed','cancelled']){
  const plan=planMissionRecovery({checkpoint:checkpoint({research:{status,attempt:1},qa:{status:'pending',attempt:0,history:[]}}),graph,missionId,graphDigest});
  assert.equal(plan.decisions.research.status,'needs_review');
  assert.equal(plan.decisions.qa.status,'blocked');
 }
});
test('a succeeded task without a checkpointed output is not trusted as a dependency',()=>{
 const plan=planMissionRecovery({checkpoint:checkpoint({research:{status:'succeeded',attempt:1},qa:{status:'pending',attempt:0,history:[]}}),graph,missionId,graphDigest});
 assert.equal(plan.decisions.research.status,'needs_review');
 assert.equal(plan.decisions.qa.status,'blocked');
});
test('returns completed only when every task has a checkpointed success',()=>{
 const plan=planMissionRecovery({checkpoint:checkpoint({
  research:{status:'succeeded',attempt:1,output:{x:1}},
  qa:{status:'succeeded',attempt:1,outputDigest:'sha256:12345678'},
  final:{status:'succeeded',attempt:1,output:{done:true}}
 },'succeeded'),graph,missionId,graphDigest});
 assert.equal(plan.status,'completed');
 assert.equal(plan.summary.completed,3);
 assert.equal(plan.execution.started,false);
});
test('rejects mission and graph mismatch, unknown checkpoint tasks and cyclic graphs',()=>{
 const cp=checkpoint({});
 assert.throws(()=>planMissionRecovery({checkpoint:cp,graph,missionId:'other',graphDigest}),/mismatch/);
 assert.throws(()=>planMissionRecovery({checkpoint:cp,graph,missionId,graphDigest:'sha256:wrong'}),/Graphe/);
 assert.throws(()=>planMissionRecovery({checkpoint:checkpoint({ghost:{status:'pending',attempt:0}}),graph,missionId,graphDigest}),/absente du graphe/);
 assert.throws(()=>planMissionRecovery({checkpoint:cp,graph:{tasks:[{id:'a',dependsOn:['b']},{id:'b',dependsOn:['a']}]},missionId,graphDigest}),/Cycle/);
});
test('rejects unknown graph dependencies and excessive graph size',()=>{
 assert.throws(()=>planMissionRecovery({checkpoint:checkpoint({}),graph:{tasks:[{id:'a',dependsOn:['missing']}]},missionId,graphDigest}),/Dépendance inconnue/);
 assert.throws(()=>planMissionRecovery({checkpoint:checkpoint({}),graph:{tasks:Array.from({length:13},(_,i)=>({id:'t'+i,dependsOn:[]}))},missionId,graphDigest}),/invalide/);
});
