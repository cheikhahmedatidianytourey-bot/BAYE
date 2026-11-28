import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeApiProbe,diagnosticPaths} from './api-health-diagnostics.js';
test('G69 exposes a fixed non-empty allowlist',()=>{const paths=diagnosticPaths();assert.ok(paths.length>=5);assert.ok(paths.every(x=>x.startsWith('/')));});
test('G69 classifies successful and failed HTTP probes',()=>{assert.equal(summarizeApiProbe('/health',200,5).ok,true);assert.equal(summarizeApiProbe('/health',503,4).ok,false);});
test('G69 rejects unknown paths from probe summary',()=>{const r=summarizeApiProbe('/evil',200,1);assert.equal(r.ok,false);assert.equal(r.error,'path-not-allowlisted');assert.equal(r.status,null);});
test('G69 bounds negative durations',()=>{assert.equal(summarizeApiProbe('/health',200,-3).durationMs,0);});
