import test from 'node:test';
import assert from 'node:assert/strict';
import {recordManualTest,listManualTests,getManualTest,getManualTestLedgerStatus} from './manual-test-evidence-ledger.js';
const record={featureId:'core',testCase:'Smoke test',outcome:'passed',notes:'Observed result',evidenceRefs:[]};
test('records valid evidence and returns generated ID',()=>{const r=recordManualTest(record);assert.equal(r.status,'recorded');assert.ok(r.record.id);assert.equal(getManualTest(r.record.id).outcome,'passed');});
test('filters ledger by feature and outcome',()=>{assert.equal(listManualTests({featureId:'core',outcome:'passed'}).total,1);assert.equal(listManualTests({featureId:'missing'}).total,0);});
test('ledger status clearly indicates volatile storage',()=>{assert.equal(getManualTestLedgerStatus().persistent,false);assert.equal(listManualTests().storage,'process-memory');});
test('rejects invalid entries without recording them',()=>{const before=listManualTests().total;assert.equal(recordManualTest({...record,outcome:'bad'}).status,'rejected');assert.equal(listManualTests().total,before);});
test('limits returned results to bounded page size',()=>{assert.ok(listManualTests({limit:10000}).limit<=100);});
