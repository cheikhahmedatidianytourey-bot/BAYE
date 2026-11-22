import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExecutionGraph,getOrchestrationRoles} from '../server/orchestration-kernel.js';
test('builds a stable dependency-aware task graph without executing work',()=>{
 const graph=buildExecutionGraph([
  {id:'final',role:'coordinator',objective:'Synthesize results',dependsOn:['research','qa'],budget:2},
  {id:'qa',role:'quality',objective:'Prepare validation plan',dependsOn:['research']},
  {id:'research',role:'research',objective:'Analyze the request'}
 ]);
 assert.equal(graph.status,'validated');
 assert.equal(graph.mode,'plan_only');
 assert.deepEqual(graph.tasks.map(x=>x.id),['research','qa','final']);
 assert.equal(graph.execution.started,false);
 assert.equal(graph.execution.externalActions,false);
 assert.equal(graph.tasks[0].status,'pending');
});
test('rejects duplicate IDs, unknown roles and unknown dependencies',()=>{
 assert.throws(()=>buildExecutionGraph([{id:'x',role:'research',objective:'A'},{id:'x',role:'research',objective:'B'}]),/dupliqué/);
 assert.throws(()=>buildExecutionGraph([{id:'x',role:'root',objective:'A'}]),/Rôle non autorisé/);
 assert.throws(()=>buildExecutionGraph([{id:'x',role:'research',objective:'A',dependsOn:['missing']}]),/Dépendance inconnue/);
});
test('rejects cycles and excessive graph depth',()=>{
 assert.throws(()=>buildExecutionGraph([{id:'a',role:'research',objective:'A',dependsOn:['b']},{id:'b',role:'quality',objective:'B',dependsOn:['a']}]),/Cycle détecté/);
 const chain=Array.from({length:9},(_,i)=>({id:'t'+i,role:'research',objective:'Task '+i,dependsOn:i?['t'+(i-1)]:[]}));
 assert.throws(()=>buildExecutionGraph(chain),/Profondeur maximale/);
});
test('enforces task count, dependency count and budget bounds',()=>{
 assert.throws(()=>buildExecutionGraph([]),/1 à/);
 assert.throws(()=>buildExecutionGraph([{id:'x',role:'research',objective:'A',budget:101}]),/Budget total/);
 assert.throws(()=>buildExecutionGraph([{id:'x',role:'research',objective:'A',dependsOn:['a','b','c','d','e','f','g']}]),/Dépendances invalides/);
});
test('exposes only declared specialist capabilities',()=>{
 const roles=getOrchestrationRoles();
 assert.ok(roles.some(x=>x.id==='security'&&x.capabilities.includes('inspect_risk')));
 assert.equal(roles.some(x=>x.id==='shell'),false);
});
