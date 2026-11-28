import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAppBuilderPrompt, parseGeneratedProject } from '../server/app-builder.js';

test('app builder rejects empty and oversized prompts',()=>{
  assert.equal(validateAppBuilderPrompt('').valid,false);
  assert.equal(validateAppBuilderPrompt('x'.repeat(4001)).valid,false);
  assert.equal(validateAppBuilderPrompt(' Build an app ').prompt,'Build an app');
});
test('app builder accepts a bounded safe manifest',()=>{
  const parsed=parseGeneratedProject(JSON.stringify({summary:'starter',files:[{path:'package.json',content:'{"scripts":{"build":"vite build"}}'},{path:'src/App.jsx',content:'export default function App(){return <main>Hello</main>}'}]}));
  assert.equal(parsed.passed,true);
  assert.equal(parsed.execution,false);
  assert.equal(parsed.buildVerified,false);
});
test('app builder rejects unsafe paths and duplicates',()=>{
  assert.equal(parseGeneratedProject(JSON.stringify({files:[{path:'../secret',content:'x'}]})).passed,false);
  assert.equal(parseGeneratedProject(JSON.stringify({files:[{path:'src/a.js',content:'x'},{path:'src/a.js',content:'y'}]})).passed,false);
});
test('app builder rejects non-json and malformed manifests',()=>{
  assert.equal(parseGeneratedProject('not json').passed,false);
  assert.equal(parseGeneratedProject(JSON.stringify({files:[]})).passed,false);
});
