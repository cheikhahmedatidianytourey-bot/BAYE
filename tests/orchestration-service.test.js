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
 await assert.rejects(()=>runBayeOrchestration({tasks:[task('research')]}),/complétion IA requis/);
});

test('runs semantic review only when explicitly requested',async()=>{
 const calls=[];
 const result=await runBayeOrchestration({
  tasks:[task('research'),task('engineering','engineering')],
  reviewMode:'semantic',
  complete:async(messages,options)=>{
   calls.push({messages,options});
   if(messages[0].content.includes('Semantic Review'))return {piece:JSON.stringify({summary:'Two reports disagree on the deployment strategy.',findings:[{type:'contradiction',severity:'medium',taskIds:['research','engineering'],explanation:'The reports recommend incompatible deployment approaches.',question:'Which operational constraint decides the choice?'}],recommendedFollowUp:['Validate deployment constraints.']}),model:'mock-reviewer'};
   return {piece:'Specialist report for '+calls.length};
  }
 });
 assert.equal(calls.length,3);
 assert.equal(result.review.semantic.status,'completed');
 assert.equal(result.review.semantic.findings[0].type,'contradiction');
 assert.equal(result.review.semantic.independentFactVerification,false);
});
test('does not spend a second model call in deterministic review mode',async()=>{
 let calls=0;
 const result=await runBayeOrchestration({tasks:[task('research'),task('engineering','engineering')],complete:async()=>{calls++;return {piece:'A report '+calls};}});
 assert.equal(calls,2);
 assert.equal(result.review.semantic,null);
});
test('keeps orchestration usable when semantic reviewer output is malformed',async()=>{
 let calls=0;
 const result=await runBayeOrchestration({tasks:[task('research'),task('engineering','engineering')],reviewMode:'semantic',complete:async()=>{calls++;return {piece:calls===3?'not json':'Specialist report '+calls};}});
 assert.equal(result.status,'succeeded');
 assert.equal(result.review.semantic.status,'unavailable');
 assert.equal(calls,3);
});

test('creates a bounded, verifiable mission memory packet for continuity',async()=>{
 const first=await runBayeOrchestration({
  missionId:'mission_12345678',
  tasks:[task('research')],
  complete:async()=>({piece:'Prior finding: use a staged rollout.'})
 });
 assert.equal(first.missionMemory.version,1);
 assert.equal(first.missionMemory.missionId,'mission_12345678');
 assert.equal(first.missionMemory.entries.length,1);
 const secondCalls=[];
 const second=await runBayeOrchestration({
  priorMemory:first.missionMemory,
  tasks:[task('engineering','engineering')],
  complete:async(messages)=>{secondCalls.push(messages);return {piece:'Engineering follow-up.'};}
 });
 assert.equal(second.missionMemory.missionId,'mission_12345678');
 assert.match(secondCalls[0][1].content,/Prior mission memory/);
 assert.match(secondCalls[0][1].content,/Prior finding: use a staged rollout/);
 assert.equal(second.missionMemory.entries.length,2);
});
test('rejects altered or cross-mission continuity memory',async()=>{
 const first=await runBayeOrchestration({missionId:'mission_12345678',tasks:[task('research')],complete:async()=>({piece:'A finding.'})});
 const altered={...first.missionMemory,entries:[{...first.missionMemory.entries[0],excerpt:'tampered'}]};
 await assert.rejects(()=>runBayeOrchestration({priorMemory:altered,tasks:[task('next')],complete:async()=>({piece:'ok'})}),/empreinte|mémoire/i);
 await assert.rejects(()=>runBayeOrchestration({priorMemory:first.missionMemory,missionId:'mission_87654321',tasks:[task('next')],complete:async()=>({piece:'ok'})}),/autre mission/i);
});
