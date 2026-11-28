import test from 'node:test';
import assert from 'node:assert/strict';
import {registryEntryFromIntake,getDatasetRegistryStatus} from '../server/ai/dataset-registry.js';
const sample={status:'processed',receipt:{digest:'a'.repeat(64)},provenance:{name:'Demo',source:'user',license:'CC0',description:'demo',modality:'text',personalData:false,privacyReview:'not-applicable',licenseReviewed:true,receivedRecordCount:3,acceptedRecordCount:2,acceptedFingerprints:['x','y']}};
test('registry entry retains receipt reconstruction metadata',()=>{const r=registryEntryFromIntake(sample);assert.equal(r.valid,true);assert.equal(r.entry.metadata.receivedRecordCount,3);assert.deepEqual(r.entry.metadata.acceptedFingerprints,['x','y']);});
test('reject invalid digest and missing reconstruction fields',()=>{assert.equal(registryEntryFromIntake({...sample,receipt:{digest:'bad'}}).valid,false);assert.equal(registryEntryFromIntake({...sample,provenance:{...sample.provenance,receivedRecordCount:undefined}}).valid,false);});
test('status declares bounded retrieval and integrity inspection',()=>{const s=getDatasetRegistryStatus();assert.equal(s.rawRecordsStored,false);assert.equal(s.trainingEnabled,false);assert.ok(s.queryFeatures.includes('receipt integrity inspection'));});
