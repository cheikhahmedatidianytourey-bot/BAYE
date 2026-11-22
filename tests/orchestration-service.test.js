import test from 'node:test';
import assert from 'node:assert/strict';
import {runBayeOrchestration} from '../server/orchestration-service.js';

const task=(id,role='research',dependsOn=[])=>({id,role,objective:'Analyze '+id,dependsOn,budget:1});
test('runs real injected specialist completions and returns a traceable task plan',async()=>{
 const calls=[];
 const result=await runBayeOrchestration({
  tasks:[task('research'),task('quality','quality',['research'])],
  complete:async(messages,options)=>{
   calls.push({messages,options});
   return {piece:'Report: '+messages[1].content.match(/Task ID: ([^\\n]+)/)[1],model:'mock-model',providerId:'mock'};
  }
 });
 assert.equal(result.status,'succeeded');
 assert.equal(calls.length,2);
 assert.equal(result.results.length,2);
 assert.equal(result.taskStates.research.status,'succeeded');
 assert.equal(result.taskStates.quality.status,'succeeded');
 assert.equal(result.execution.toolsInvoked,0);
 assert.equal(result.execution.externalActions,false);
 assert.equal(result.safety.toolsEnabled,false);
 assert.equal(result.safety.independentFactVerification,false);
 assert.match(calls[1].messages[1].content,/Report: research/);
});
test('enforces service-specific task, budget and depth bounds',async()=>{
 const complete=async()=>({piece:'ok'});
 await assert.rejects(()=>runBayeOrchestration({tasks:Array.from({length:6},(_,i)=>task('t'+i)),complete}),/1 à 5 tâches/);
 await assert.rejects(()=>runBayeOrchestration({tasks:[{...task('large'),budget:11}],complete}),/Budget total/);
 await assert.rejects(()=>runBayeOrchestration({tasks:[task('bad','administrator')],complete}),/Rôle non autorisé/);
});
test('returns a failed task state when a provider call fails',async()=>{
 const result=await runBayeOrchestration({tasks:[task('research')],complete:async()=>{throw new Error('provider unavailable');}});
 assert.equal(result.status,'failed');
 assert.equal(result.taskStates.research.status,'failed');
 assert.equal(result.execution.externalActions,false);
});
test('requires a provider completion function',async()=>{
 await assert.rejects(()=>runBayeOrchestration({tasks:[task('research')]}),/complétion IA requise/);
});
