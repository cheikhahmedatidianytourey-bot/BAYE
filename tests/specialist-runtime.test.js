import test from 'node:test';
import assert from 'node:assert/strict';
import {runSpecialistTasks} from '../server/specialist-runtime.js';

const graph=(tasks)=>({mode:'plan_only',tasks});
const task=(id,dependsOn=[])=>({id,role:'research',objective:'Do '+id,dependsOn,capabilities:['analyze_input']});

test('runs independent specialists concurrently and preserves bounded result records',async()=>{
 let active=0,maxActive=0;
 const result=await runSpecialistTasks(graph([task('a'),task('b'),task('c')]),{
  maxParallel:2,
  execute:async({task:t})=>{
   active++;maxActive=Math.max(maxActive,active);
   await new Promise(resolve=>setTimeout(resolve,5));
   active--;
   return {summary:'done '+t.id};
  }
 });
 assert.equal(result.status,'succeeded');
 assert.equal(maxActive,2);
 assert.equal(result.results.length,3);
 assert.equal(result.execution.externalActions,false);
 assert.equal(result.execution.toolsInvoked,0);
 assert.equal(result.taskStates.a.status,'succeeded');
});
test('passes dependency outputs to downstream specialist tasks',async()=>{
 const seen=[];
 const result=await runSpecialistTasks(graph([task('final',['research']),task('research')]),{
  execute:async({task:t,dependencies})=>{
   seen.push(t.id);
   return t.id==='research'?{finding:'evidence'}:{received:dependencies.research.finding};
  }
 });
 assert.deepEqual(seen,['research','final']);
 assert.deepEqual(result.results.find(x=>x.taskId==='final').output,{received:'evidence'});
});
test('fails closed and cancels work that has not started after a worker failure',async()=>{
 const result=await runSpecialistTasks(graph([task('bad'),task('later',['bad'])]),{
  execute:async()=>{throw new Error('controlled test failure');}
 });
 assert.equal(result.status,'failed');
 assert.equal(result.taskStates.bad.status,'failed');
 assert.equal(result.taskStates.later.status,'cancelled');
 assert.equal(result.execution.externalActions,false);
});
test('rejects invalid graphs, missing executors and unsafe parallelism',async()=>{
 await assert.rejects(()=>runSpecialistTasks({mode:'execute',tasks:[task('a')]},{execute:async()=>({})}));
 await assert.rejects(()=>runSpecialistTasks(graph([task('a',['missing'])]),{execute:async()=>({})}));
 await assert.rejects(()=>runSpecialistTasks(graph([task('a')]),{execute:async()=>({}),maxParallel:4}),/maximum 3/);
 await assert.rejects(()=>runSpecialistTasks(graph([task('a')]),{}),/Exécuteur/);
});
test('marks malformed or oversized worker outputs failed and does not expose them',async()=>{
 const malformed=await runSpecialistTasks(graph([task('bad')]),{execute:async()=> 'text'});
 assert.equal(malformed.status,'failed');
 assert.equal(malformed.taskStates.bad.status,'failed');
 assert.equal(malformed.results[0].status,'failed');
 assert.equal(Object.hasOwn(malformed.results[0],'output'),false);
 const oversized=await runSpecialistTasks(graph([task('large')]),{execute:async()=>({payload:'x'.repeat(50001)})});
 assert.equal(oversized.status,'failed');
 assert.equal(oversized.taskStates.large.status,'failed');
 assert.equal(oversized.results[0].status,'failed');
 assert.equal(Object.hasOwn(oversized.results[0],'output'),false);
});

test('rejects cycles and malformed task contracts before invoking workers',async()=>{
 let invoked=0;const execute=async()=>{invoked++;return {ok:true};};
 await assert.rejects(()=>runSpecialistTasks(graph([task('a',['b']),task('b',['a'])]),{execute}),/cyclique/);
 await assert.rejects(()=>runSpecialistTasks(graph([{id:'x',dependsOn:[]}]),{execute}),/Tâche de plan invalide/);
 await assert.rejects(()=>runSpecialistTasks(graph([{...task('dup'),dependsOn:['dup','dup']}]),{execute}),/dupliquées/);
 await assert.rejects(()=>runSpecialistTasks(graph([{...task('caps'),capabilities:['x'.repeat(65)]}]),{execute}),/Limites/);
 assert.equal(invoked,0);
});
test('rejects dependency cycles before any specialist starts',async()=>{
 let invoked=0;const execute=async()=>{invoked++;return {};};
 await assert.rejects(()=>runSpecialistTasks(graph([task('a',['b']),task('b',['c']),task('c',['a'])]),{execute}),/cyclique/);
 assert.equal(invoked,0);
});
