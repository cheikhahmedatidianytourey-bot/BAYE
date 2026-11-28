import test from 'node:test';import assert from 'node:assert/strict';import {registryEntryFromIntake,getDatasetRegistryStatus} from '../server/ai/dataset-registry.js';
const sample={status:'processed',receipt:{digest:'a'.repeat(64)},provenance:{name:'Demo',source:'user',license:'CC0',modality:'text',personalData:false,receivedRecordCount:2,acceptedRecordCount:2,acceptedFingerprints:['x','y']}};
test('build registry entry from intake receipt',()=>{const r=registryEntryFromIntake(sample);assert.equal(r.valid,true);assert.equal(r.entry.recordCount,2);assert.equal(r.entry.receiptDigest,'a'.repeat(64));});
test('rejects invalid intake receipt and provenance',()=>{assert.equal(registryEntryFromIntake({status:'rejected'}).valid,false);assert.equal(registryEntryFromIntake({...sample,provenance:{}}).valid,false);});
test('status accurately reports storage configuration',()=>{const s=getDatasetRegistryStatus();assert.equal(s.rawRecordsStored,false);assert.equal(s.trainingEnabled,false);});
