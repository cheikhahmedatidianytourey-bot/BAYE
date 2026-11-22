import test from 'node:test';
import assert from 'node:assert/strict';
import {runSafeWorkflow,getWorkflowLimits} from '../server/safe-workflow.js';
test('runs multiple allowlisted steps sequentially',()=>{const r=runSafeWorkflow([{tool:'calculator',input:{expression:'6*7'}},{tool:'text_stats',input:{text:'BAYE Core'}}]);assert.equal(r.status,'completed');assert.equal(r.steps.length,2);assert.equal(r.steps[0].output.result,42);assert.equal(r.steps[1].output.words,2);});
test('rejects empty and oversized workflows',()=>{assert.throws(()=>runSafeWorkflow([]));assert.throws(()=>runSafeWorkflow(Array.from({length:6},()=>({tool:'calculator',input:{expression:'1+1'}}))));});
test('fails closed on unknown tool',()=>{assert.throws(()=>runSafeWorkflow([{tool:'shell',input:{}}]),/non autorisé/);});
test('stops on invalid step and reports no external action',()=>{assert.throws(()=>runSafeWorkflow([{tool:'calculator',input:{expression:'1+1'}},{tool:'calculator',input:{expression:'1/0'}},{tool:'text_stats',input:{text:'later'}}]));assert.equal(getWorkflowLimits().externalActions,false);});
