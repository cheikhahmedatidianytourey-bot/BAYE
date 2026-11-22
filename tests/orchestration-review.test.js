import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOrchestrationResults} from '../server/orchestration-review.js';

test('marks traceable successful specialist reports complete',()=>{
 const result=reviewOrchestrationResults({results:[{taskId:'research',status:'succeeded',output:{content:'Analysis report'}}],taskStates:{research:{status:'succeeded'}}});
 assert.equal(result.status,'complete');
 assert.deepEqual(result.findings,[]);
 assert.equal(result.checks.independentFactVerification,false);
});
test('flags failed, missing and inconsistent task results',()=>{
 const result=reviewOrchestrationResults({results:[{taskId:'research',status:'failed'}],taskStates:{research:{status:'running'}}});
 assert.equal(result.status,'incomplete');
 assert.ok(result.findings.some(item=>item.code==='TASK_NOT_SUCCEEDED'));
});
test('flags duplicate reports without claiming semantic contradiction detection',()=>{
 const report={content:'Same specialist output'};
 const result=reviewOrchestrationResults({results:[{taskId:'a',status:'succeeded',output:report},{taskId:'b',status:'succeeded',output:report}],taskStates:{a:{status:'succeeded'},b:{status:'succeeded'}}});
 assert.equal(result.status,'needs_review');
 assert.ok(result.findings.some(item=>item.code==='DUPLICATE_REPORT'));
 assert.equal(result.checks.semanticContradictionDetection,false);
});
test('reports empty execution as incomplete',()=>{
 const result=reviewOrchestrationResults({results:[],taskStates:{}});
 assert.equal(result.status,'incomplete');
});
