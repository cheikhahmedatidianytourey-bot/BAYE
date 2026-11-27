import test from 'node:test';import assert from 'node:assert/strict';import {prepareProjectSandbox} from '../server/sandbox-project-harness.js';
test('rejects invalid manifests',async()=>{await assert.rejects(()=>prepareProjectSandbox([]),/INVALID_MANIFEST/);});
test('rejects path traversal',async()=>{await assert.rejects(()=>prepareProjectSandbox([{path:'../escape',content:'x'}]),/UNSAFE_PATH/);});
test('rejects duplicate files',async()=>{await assert.rejects(()=>prepareProjectSandbox([{path:'a',content:'x'},{path:'a',content:'y'}]),/DUPLICATE_PATH/);});
test('rejects unapproved command',async()=>{await assert.rejects(()=>prepareProjectSandbox([{path:'a',content:'x'}],{command:'node',args:['-v']}),/COMMAND_NOT_ALLOWED/);});
test('prepares temporary files without executing commands',async()=>{const r=await prepareProjectSandbox([{path:'README.md',content:'ok'}]);assert.equal(r.filesWritten,1);assert.equal(r.execution,null);assert.match(r.warning,/not an OS-level sandbox/);});
