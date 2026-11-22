import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOperationalAudit} from '../server/operational-audit.js';
test('audit returns read-only indicators without secret values',()=>{
 const memoryToken='x'.repeat(40),monitorSecret='y'.repeat(40),providerSecret='BAYE_PROVIDER_KEY_7f3a9c';
 const r=buildOperationalAudit({AI_API_KEY:providerSecret,BAYE_MEMORY_TOKEN:memoryToken,BAYE_MONITOR_SECRET:monitorSecret});
 assert.equal(r.overall,'diagnostic_only');assert.ok(Array.isArray(r.checks));
 const serialized=JSON.stringify(r);
 assert.ok(!serialized.includes(providerSecret));assert.ok(!serialized.includes(memoryToken));assert.ok(!serialized.includes(monitorSecret));
 assert.ok(r.disclaimer.includes('no configuration changed'));
});
test('audit flags missing provider configuration',()=>{const r=buildOperationalAudit({});assert.ok(r.checks.some(c=>c.id==='primary_ai_provider'&&c.status==='missing'));});
