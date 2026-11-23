import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExecutionGraph} from '../server/orchestration-kernel.js';
import {createMissionCheckpoint} from '../server/mission-checkpoint.js';
import {digestMissionGraph} from '../server/mission-checkpoint-session.js';
import {inspectMissionRecovery} from '../server/mission-recovery-service.js';

const owner='a'.repeat(64),missionId='mission_preview_123';
const tasks=[
 {id:'research',role:'research',objective:'Collect evidence',dependsOn:[]},
 {id:'review',role:'quality',objective:'Review evidence',dependsOn:['research']}
];
function graph(){return buildExecutionGraph(tasks,{maxTasks:5,maxDependenciesPerTask:4,maxTotalBudget:10,maxDepth:5});}

test('returns a read-only recovery plan for the matching durable checkpoint',async()=>{
 const executionGraph=graph(),graphDigest=digestMissionGraph(executionGraph);
 const checkpoint=createMissionCheckpoint({missionId,graphDigest,revision:2,status:'running',tasks:{
  research:{status:'succeeded',attempt:1,history:[{status:'running',at:new Date().toISOString()},{status:'succeeded',at:new Date().toISOString()}],output:{content:'evidence'}},
  review:{status:'running',attempt:1,history:[{status:'running',at:new Date().toISOString()}]}
 }});
 let loads=0;
 const ledger={async load(args){loads++;assert.deepEqual(args,{ownerId:owner,missionId,graphDigest});return checkpoint;}};
 const plan=await inspectMissionRecovery({ledger,ownerId:owner,missionId,graph:executionGraph});
 assert.equal(loads,1);
 assert.equal(plan.status,'needs_review');
 assert.equal(plan.decisions.research.status,'completed');
 assert.equal(plan.decisions.review.status,'needs_review');
 assert.deepEqual(plan.execution,{started:false,workersInvoked:0,retriesScheduled:0,externalActions:false,checkpointWritten:false});
});

test('returns null when the mission has no durable checkpoint',async()=>{
 const result=await inspectMissionRecovery({ledger:{load:async()=>null},ownerId:owner,missionId,graph:graph()});
 assert.equal(result,null);
});

test('rejects untrusted owner and malformed mission identifiers before reading ledger',async()=>{
 let loads=0;const ledger={load:async()=>{loads++;return null;}};
 await assert.rejects(()=>inspectMissionRecovery({ledger,ownerId:'raw-user-id',missionId,graph:graph()}),/Espace propriétaire/);
 await assert.rejects(()=>inspectMissionRecovery({ledger,ownerId:owner,missionId:'../other',graph:graph()}),/Identifiant de mission/);
 assert.equal(loads,0);
});

test('does not write or mutate the durable ledger',async()=>{
 const executionGraph=graph(),graphDigest=digestMissionGraph(executionGraph);
 const checkpoint=createMissionCheckpoint({missionId,graphDigest,revision:0,status:'running',tasks:{
  research:{status:'running',attempt:1,history:[{status:'running',at:new Date().toISOString()}]},
  review:{status:'pending',attempt:0,history:[]}
 }});
 let writes=0;
 const ledger={load:async()=>checkpoint,save:async()=>{writes++;throw new Error('unexpected write');}};
 await inspectMissionRecovery({ledger,ownerId:owner,missionId,graph:executionGraph});
 assert.equal(writes,0);
});
