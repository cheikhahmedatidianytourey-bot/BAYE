import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTextOutput} from './verification-layer.js';

test('verification layer accepts structurally valid text',()=>{
  const report=verifyTextOutput('A complete response.');
  assert.equal(report.passed,true);
  assert.equal(report.scope,'structural_only');
  assert.ok(report.checks.every(check=>check.passed));
});

test('verification layer rejects empty and whitespace-only output',()=>{
  assert.equal(verifyTextOutput('').passed,false);
  assert.equal(verifyTextOutput('   ').passed,false);
});

test('verification layer rejects non-text output',()=>{
  assert.equal(verifyTextOutput(null).passed,false);
  assert.equal(verifyTextOutput({text:'not a string'}).passed,false);
});

test('verification layer enforces the configured maximum length',()=>{
  const report=verifyTextOutput('12345',{maxLength:4});
  assert.equal(report.passed,false);
  assert.equal(report.checks.find(check=>check.id==='maximum_length').passed,false);
});

test('verification layer rejects null bytes',()=>{
  const report=verifyTextOutput('unsafe\u0000text');
  assert.equal(report.passed,false);
});
