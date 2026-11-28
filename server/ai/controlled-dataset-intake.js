// G54: bounded provenance and controlled, caller-supplied dataset batch intake.
// This prototype processes in memory only: no persistence, URL fetching, or training.
import crypto from 'node:crypto';
import { inspectDatasetBatch } from './data-quality-pipeline.js';
const MAX_TEXT=300, MODALITIES=new Set(['text','image','video','audio','multimodal']);
function canonical(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';}
function boundedText(value,label,max=MAX_TEXT){if(typeof value!=='string'||!value.trim()||value.trim().length>max)return {error:label+' is required and bounded.'};return {value:value.trim()};}
export function inspectControlledDatasetIntake(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Intake object required.'};
 const metadata=input.dataset;
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {status:'rejected',error:'Dataset provenance metadata required.'};
 const name=boundedText(metadata.name,'name',120),source=boundedText(metadata.source,'source'),license=boundedText(metadata.license,'license'),description=boundedText(metadata.description,'description',1000);
 for(const check of [name,source,license,description])if(check.error)return {status:'rejected',error:check.error};
 if(!MODALITIES.has(metadata.modality))return {status:'rejected',error:'Unsupported modality.'};
 if(typeof metadata.personalData!=='boolean')return {status:'rejected',error:'personalData declaration must be explicit.'};
 if(metadata.personalData&&metadata.privacyReview!=='completed')return {status:'rejected',error:'Datasets declaring personal data require privacyReview=completed.'};
 if(metadata.licenseReviewed!==true)return {status:'rejected',error:'Explicit licenseReviewed=true declaration required.'};
 const quality=inspectDatasetBatch({records:input.records});
 if(quality.status==='rejected')return {status:'rejected',error:quality.error};
 const provenance={name:name.value,source:source.value,license:license.value,description:description.value,modality:metadata.modality,personalData:metadata.personalData,privacyReview:metadata.personalData?metadata.privacyReview:'not-applicable',licenseReviewed:true,receivedRecordCount:quality.report.inputCount,acceptedRecordCount:quality.report.acceptedCount,acceptedFingerprints:quality.report.accepted.map(x=>x.fingerprint)};
 const receipt=crypto.createHash('sha256').update(canonical(provenance)).digest('hex');
 return {status:'processed',provenance,quality:quality.report,receipt:{algorithm:'sha256',digest:receipt,scope:'provenance metadata and accepted record fingerprints'},stage:'intake-preview-only',storage:'none',externalFetch:false,trainingEnabled:false,executionEnabled:false};
}
export function getControlledIntakeStatus(){return {stage:'prototype',mode:'caller-supplied batch intake preview',provenanceFields:['name','source','license','licenseReviewed','modality','personalData','privacyReview'],privacyGate:'declared personal data requires privacyReview=completed',storage:'none',externalFetch:false,trainingEnabled:false,executionEnabled:false};}
