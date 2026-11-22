import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyToolResult} from '../server/independent-verifier.js';
test('independently recomputes calculator output',()=>{assert.equal(verifyToolResult('calculator',{expression:'(6*7)+1'},{tool:'calculator',result:43,verified:true}).passed,true);});
test('rejects incorrect calculator result',()=>{const r=verifyToolResult('calculator',{expression:'6*7'},{tool:'calculator',result:41,verified:true});assert.equal(r.passed,false);assert.match(r.issues[0],/differs/);});
test('checks text statistics against original input',()=>{assert.equal(verifyToolResult('text_stats',{text:'BAYE Core'},{tool:'text_stats',characters:9,words:2,lines:1,verified:true}).passed,true);});
test('rejects altered text counts',()=>{const r=verifyToolResult('text_stats',{text:'BAYE Core'},{tool:'text_stats',characters:9,words:3,lines:1});assert.equal(r.passed,false);});
test('rejects unsupported tools',()=>{assert.equal(verifyToolResult('shell',{},{}).passed,false);});
