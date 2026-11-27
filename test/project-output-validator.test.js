import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectFiles } from '../server/project-output-validator.js';

test('accepts a simple multi-file project manifest',()=>{const r=validateProjectFiles([{path:'src/main.js',content:'console.log(1)'},{path:'README.md',content:'# App'}]);assert.equal(r.passed,true);assert.equal(r.filesChecked,2);});
test('rejects non-array and empty manifests',()=>{assert.equal(validateProjectFiles(null).passed,false);assert.ok(validateProjectFiles([]).issues.some(x=>x.code==='EMPTY_PROJECT'));});
test('rejects traversal, absolute, dot and backslash paths',()=>{const r=validateProjectFiles([{path:'../secret',content:''},{path:'/root',content:''},{path:'src\\bad.js',content:''},{path:'./file',content:''}]);assert.ok(r.issues.filter(x=>x.code==='UNSAFE_PATH').length>=4);});
test('detects duplicate paths',()=>{const r=validateProjectFiles([{path:'app.js',content:''},{path:'app.js',content:'x'}]);assert.ok(r.issues.some(x=>x.code==='DUPLICATE_PATH'));});
test('enforces file count limit',()=>{const r=validateProjectFiles([{path:'a',content:''},{path:'b',content:''}],{maxFiles:1});assert.ok(r.issues.some(x=>x.code==='TOO_MANY_FILES'));});
test('rejects non-string file contents',()=>{const r=validateProjectFiles([{path:'app.js',content:123}]);assert.ok(r.issues.some(x=>x.code==='CONTENT_NOT_STRING'));});
test('enforces aggregate content size',()=>{const r=validateProjectFiles([{path:'a',content:'12345'}],{maxTotalBytes:4});assert.ok(r.issues.some(x=>x.code==='TOTAL_SIZE_EXCEEDED'));});
test('measures UTF-8 bytes',()=>{const r=validateProjectFiles([{path:'a',content:'é'}]);assert.equal(r.totalBytes,2);});
test('documents structural-only scope',()=>{const r=validateProjectFiles([{path:'app.js',content:'ok'}]);assert.equal(r.scope,'structure_only');assert.match(r.limitation,/does not execute/);});
