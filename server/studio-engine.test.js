import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioInstruction } from './studio-engine.js';

test('Studio instructions demand evidence and distinguish capability from aspiration',()=>{
  const prompt=buildStudioInstruction({kind:'Idée de projet',prompt:'Improve BAYE',context:{configuredAIProvider:true}});
  assert.match(prompt,/non vérifié/i);
  assert.match(prompt,/capacités attestées/i);
  assert.match(prompt,/propositions/i);
  assert.match(prompt,/configuredAIProvider/);
});
test('Studio context cannot claim external execution or live inspection',()=>{
  const prompt=buildStudioInstruction({kind:'Code'});
  assert.match(prompt,/No browsing, code execution, external actions/);
  assert.match(prompt,/Ne prétends pas exécuter/);
});
test('Studio safely bounds request type in context',()=>{
  const prompt=buildStudioInstruction({kind:'x'.repeat(500),context:{}});
  assert.match(prompt,/requestType/);
  assert.ok(prompt.length<10000);
});
