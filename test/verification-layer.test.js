import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTextOutput } from '../server/verification-layer.js';

test('accepts non-empty text within the default limit',()=>{ const result=verifyTextOutput('A useful software specification'); assert.equal(result.passed,true); assert.equal(result.scope,'structural_only'); assert.ok(result.checks.every(check=>check.passed)); });
test('rejects non-string output',()=>{ for(const value of [null,undefined,42,{},[]]) assert.equal(verifyTextOutput(value).passed,false); });
test('rejects empty and whitespace-only output',()=>{ assert.equal(verifyTextOutput('').passed,false); assert.equal(verifyTextOutput('   \\n\\t').passed,false); });
test('enforces configurable maximum length',()=>{ assert.equal(verifyTextOutput('12345',{maxLength:5}).passed,true); assert.equal(verifyTextOutput('123456',{maxLength:5}).passed,false); });
test('detects null bytes',()=>{ assert.equal(verifyTextOutput('hello\\u0000world').passed,false); });
test('preserves label and check diagnostics on failure',()=>{ const result=verifyTextOutput('',{label:'software-project-output'}); assert.equal(result.label,'software-project-output'); assert.equal(result.passed,false); assert.ok(result.checks.some(check=>check.id==='non_empty'&&!check.passed)); });
test('reports structural scope without claiming semantic correctness',()=>{ const result=verifyTextOutput('Looks plausible but unverified'); assert.match(result.limitation,/factual accuracy/); assert.equal(result.scope,'structural_only'); });
