import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBuildTestRequest, inspectBuildTestRequest } from '../server/project-build-test-api.js';

test('rejects missing and empty file arrays',()=>{
  assert.equal(validateBuildTestRequest(null).valid,false);
  assert.equal(validateBuildTestRequest([]).valid,false);
});
test('rejects invalid file shape and excessive manifest',()=>{
  assert.equal(validateBuildTestRequest([{path:'a'}]).valid,false);
  assert.equal(validateBuildTestRequest(Array.from({length:81},(_,i)=>({path:String(i),content:''}))).valid,false);
});
test('accepts bounded manifests but does not execute without sandbox',async()=>{
  const files=[{path:'package.json',content:JSON.stringify({scripts:{build:'vite build'}})}];
  const result=await inspectBuildTestRequest(files);
  assert.equal(result.passed,false);
  assert.equal(result.stage,'configuration');
  assert.equal(result.executionEnabled,false);
  assert.ok(result.issues.some(i=>i.code==='SANDBOX_ADAPTER_REQUIRED'));
});
test('rejects traversal manifest in runner preflight',async()=>{
  const result=await inspectBuildTestRequest([{path:'../bad',content:'x'}]);
  assert.equal(result.passed,false);
  assert.equal(result.stage,'preflight');
});
