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
test('rejects malformed or oversized worker outputs',async()=>{
 await assert.rejects(()=>runSpecialistTasks(graph([task('a')]),{execute:async()=> 'text'}),/objet résultat/);
 await assert.rejects(()=>runSpecialistTasks(graph([task('a')]),{execute:async()=>({payload:'x'.repeat(50001)})}),/trop volumineux/);
});
