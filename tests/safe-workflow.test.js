import test from 'node:test';
import assert from 'node:assert/strict';
import {runSafeWorkflow,getWorkflowLimits,verifyWorkflowReceipts} from '../server/safe-workflow.js';
test('runs multiple allowlisted steps sequentially and verifies receipts',()=>{const r=runSafeWorkflow([{tool:'calculator',input:{expression:'6*7'}},{tool:'text_stats',input:{text:'BAYE Core'}}]);assert.equal(r.status,'completed');assert.equal(r.steps.length,2);assert.equal(r.steps[0].output.result,42);assert.equal(r.steps[1].output.words,2);assert.equal(r.verification.passed,true);assert.equal(r.verification.verified,2);assert.equal(r.steps[0].receipt.length,64);});
test('receipt verification detects output tampering',()=>{const r=runSafeWorkflow([{tool:'calculator',input:{expression:'6*7'}}]);r.steps[0].output.result=43;assert.equal(verifyWorkflowReceipts(r.steps).passed,false);});
test('rejects empty and oversized workflows',()=>{
 assert.throws(()=>runSafeWorkflow([]));
 const oversized=Array.from({length:6},()=>({tool:'calculator',input:{expression:'1+1'}}));
 assert.throws(()=>runSafeWorkflow(oversized));
});
test('fails closed on unknown tool',()=>{assert.throws(()=>runSafeWorkflow([{tool:'shell',input:{}}]),/non autorisé/);});
test('stops on invalid step and reports no external action',()=>{assert.throws(()=>runSafeWorkflow([{tool:'calculator',input:{expression:'1+1'}},{tool:'calculator',input:{expression:'1/0'}},{tool:'text_stats',input:{text:'later'}}]));assert.equal(getWorkflowLimits().externalActions,false);});
