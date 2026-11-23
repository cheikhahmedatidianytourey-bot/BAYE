import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildExecutionGraph} from '../server/orchestration-kernel.js';
import {createDurableMissionLedger} from '../server/durable-mission-ledger.js';
import {createDurableMissionCheckpointSession} from '../server/mission-checkpoint-session.js';
import {runSpecialistTasks} from '../server/specialist-runtime.js';
const owner='a'.repeat(64),missionId='mission_12345678';
const tasks=[{id:'research',role:'research',objective:'Collect evidence',dependsOn:[]},{id:'quality',role:'quality',objective:'Review evidence',dependsOn:['research']}];
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'baye-checkpoint-session-'));t.after(()=>rm(directory,{recursive:true,force:true}));const ledger=createDurableMissionLedger({directory});const graph=buildExecutionGraph(tasks,{maxTasks:5,maxDependenciesPerTask:4,maxTotalBudget:10,maxDepth:5});const session=createDurableMissionCheckpointSession({ledger,ownerId:owner,missionId,graph});return {ledger,graph,session};}
test('persists authenticated task transitions and completed outputs with guarded revisions',async t=>{const {ledger,graph,session}=await setup(t);await session.initialized();const result=await runSpecialistTasks(graph,{maxParallel:1,execute:async({task})=>({content:'done '+task.id}),onTaskState:session.onTaskState});assert.equal(result.status,'succeeded');const final=await session.finish('succeeded');const saved=await ledger.load({ownerId:owner,missionId,graphDigest:final.graphDigest});assert.equal(saved.status,'succeeded');assert.equal(saved.tasks.research.status,'succeeded');assert.equal(saved.tasks.quality.status,'succeeded');assert.deepEqual(saved.tasks.research.output,{content:'done research'});assert.equal(saved.tasks.research.attempt,1);assert.equal(saved.revision,final.revision);assert.equal((await ledger.verify({ownerId:owner,missionId})).valid,true);});
test('does not execute a worker when the durable running checkpoint cannot be written',async t=>{const {graph,session}=await setup(t);await session.initialized();let invoked=0;await assert.rejects(()=>runSpecialistTasks(graph,{maxParallel:1,execute:async()=>{invoked++;return {ok:true};},onTaskState:async({state})=>{if(state.status==='running')throw new Error('simulated durable write failure');}}),/simulated durable write failure/);assert.equal(invoked,0);});
test('rejects unsafe owner namespace and malformed mission identifiers',async t=>{const {graph}=await setup(t);assert.throws(()=>createDurableMissionCheckpointSession({ledger:{save:async()=>{}},ownerId:'raw:account-id',missionId,graph}),/Hashed owner/);assert.throws(()=>createDurableMissionCheckpointSession({ledger:{save:async()=>{}},ownerId:owner,missionId:'bad/id',graph}),/Mission identifier/);});
