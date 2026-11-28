import test from 'node:test';
import assert from 'node:assert/strict';
import {trainOwnedTextPrototype,predictOwnedTextModel} from './owned-text-prototype-trainer.js';
const train=[{text:'team wins game football',label:'sports'},{text:'player scores goal',label:'sports'},{text:'election government vote',label:'politics'},{text:'minister parliament policy',label:'politics'}];
test('serialized artifact predicts held-out samples',()=>{const r=trainOwnedTextPrototype({train,test:[{text:'football player wins',label:'sports'}]});assert.equal(r.status,'trained');assert.equal(predictOwnedTextModel(r.modelArtifact,'football player wins').label,'sports');assert.equal(predictOwnedTextModel(r.modelArtifact,'government election').label,'politics');});
test('inference rejects malformed artifact and oversized text',()=>{assert.equal(predictOwnedTextModel({},'x').status,'rejected');const r=trainOwnedTextPrototype({train,test:[{text:'football',label:'sports'}]});assert.equal(predictOwnedTextModel(r.modelArtifact,'x'.repeat(2001)).status,'rejected');});
