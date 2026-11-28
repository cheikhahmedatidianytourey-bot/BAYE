import test from 'node:test';import assert from 'node:assert/strict';import {classifyProbe,analyzeDiagnosticReport,compareDiagnosticReports} from './fault-classification.js';
test('G70 classifies healthy probes',()=>assert.equal(classifyProbe({ok:true,status:200}).severity,'healthy'));
test('G70 timeout major',()=>assert.equal(classifyProbe({ok:false,error:'timeout'}).severity,'major'));
test('G70 network failure critical',()=>assert.equal(classifyProbe({ok:false,error:'connection-failed'}).severity,'critical'));
test('G70 HTTP server error',()=>assert.equal(classifyProbe({ok:false,status:503,error:'http-status'}).category,'server-error'));
test('G70 bounded analyzer summarizes',()=>{const r=analyzeDiagnosticReport({results:[{ok:true,status:200},{ok:false,error:'timeout'}]});assert.equal(r.summary.total,2);assert.equal(r.summary.major,1);});
test('G70 comparison reports regression and recovery',()=>{const r=compareDiagnosticReports({results:[{path:'/a',ok:true},{path:'/b',ok:false,error:'timeout'}]},{results:[{path:'/a',ok:false,status:503,error:'http-status'},{path:'/b',ok:true}]});assert.equal(r.regressions,1);assert.equal(r.recoveries,1);});
test('G70 rejects malformed reports',()=>assert.equal(analyzeDiagnosticReport({}).status,'rejected'));
