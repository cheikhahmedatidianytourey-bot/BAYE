import test from 'node:test';
import assert from 'node:assert/strict';
import {manualEvidenceStorageReady,validatePersistentManualEvidence} from './manual-test-evidence-storage.js';
test('G68 readiness accurately reflects database configuration',()=>{assert.equal(manualEvidenceStorageReady(),Boolean(process.env.DATABASE_URL));});
test('G68 rejects invalid evidence and requires failure notes',()=>{
 const result=validatePersistentManualEvidence({featureId:'x',testCase:'case',outcome:'failed',notes:'',evidenceRefs:[]});
 assert.equal(result.status,'rejected');
});
test('G68 validates bounded valid evidence without claiming persistence',()=>{
 const result=validatePersistentManualEvidence({featureId:'x',testCase:'case',outcome:'passed',notes:'ok',evidenceRefs:[]});
 assert.equal(result.status,'validated');assert.ok(result.record.id);assert.ok(result.record.recordedAt);
});
