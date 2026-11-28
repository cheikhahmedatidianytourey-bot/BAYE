// G58: bounded heuristic training-readiness assessment; never authorizes training.
const TARGETS=new Set(['BAYE CORE MODEL','BAYE VISION','BAYE MOTION','BAYE AUDIO']);
const MODALITY={ 'BAYE CORE MODEL':['text','multimodal'],'BAYE VISION':['image','multimodal'],'BAYE MOTION':['video','multimodal'],'BAYE AUDIO':['audio','multimodal'] };
const MIN_RECORDS={text:1000,image:100,video:100,audio:100,multimodal:100};
export function assessTrainingReadiness(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Assessment object required.'};
 const target=input.targetModel;if(!TARGETS.has(target))return {status:'rejected',error:'Unknown target model.'};
 if(!Array.isArray(input.datasets)||input.datasets.length<1||input.datasets.length>100)return {status:'rejected',error:'Provide 1–100 dataset candidates.'};
 const items=input.datasets.map((d,i)=>{
  const checks=[],issues=[];if(!d||typeof d!=='object'||Array.isArray(d)){return {index:i,decision:'blocked',issues:['invalid-dataset-object'],checks};}
  const modality=typeof d.modality==='string'?d.modality:'';
  checks.push({gate:'modality-fit',passed:MODALITY[target].includes(modality)});if(!MODALITY[target].includes(modality))issues.push('modality-not-compatible-with-target');
  checks.push({gate:'metadata',passed:['name','source','license'].every(k=>typeof d[k]==='string'&&d[k].trim().length>0)});if(!checks.at(-1).passed)issues.push('missing-provenance-metadata');
  checks.push({gate:'license-review',passed:d.licenseReviewed===true});if(!checks.at(-1).passed)issues.push('license-not-reviewed');
  const privacyPassed=d.personalData===false||(d.personalData===true&&d.privacyReview==='completed');
  checks.push({gate:'privacy-declaration',passed:privacyPassed});if(!privacyPassed)issues.push('privacy-review-required-or-declaration-missing');
  const count=Number.isInteger(d.acceptedRecordCount)&&d.acceptedRecordCount>=0;
  checks.push({gate:'record-count',passed:count});if(!count)issues.push('accepted-record-count-missing');
  const threshold=MIN_RECORDS[modality]||100;
  const sufficient=count&&d.acceptedRecordCount>=threshold;
  checks.push({gate:'quantity-screen',passed:sufficient,threshold,observed:count?d.acceptedRecordCount:null});if(!sufficient)issues.push('below-prototype-quantity-screen');
  const qualityProvided=typeof d.qualitySummary==='object'&&d.qualitySummary!==null&&Number.isFinite(d.qualitySummary.acceptedCount)&&Number.isFinite(d.qualitySummary.inputCount);
  checks.push({gate:'quality-evidence',passed:qualityProvided});if(!qualityProvided)issues.push('quality-summary-not-provided');
  if(qualityProvided&&d.qualitySummary.inputCount>0){const ratio=d.qualitySummary.acceptedCount/d.qualitySummary.inputCount;if(ratio<0.8)issues.push('low-acceptance-ratio');}
  const passed=checks.every(c=>c.passed)&&!issues.some(x=>x==='low-acceptance-ratio');
  return {index:i,name:typeof d.name==='string'?d.name.slice(0,120):null,modality,decision:passed?'candidate-for-human-review':'needs-review',checks,issues};
 });
 const eligible=items.filter(x=>x.decision==='candidate-for-human-review').length;
 return {status:'assessed',targetModel:target,summary:{candidateCount:items.length,eligibleForHumanReview:eligible,needsReview:items.length-eligible},items,stage:'prototype-screening-only',trainingAuthorized:false,scope:'Heuristic screening only. Thresholds are provisional, not scientific benchmarks. No license, privacy, data quality or training fitness is independently verified.'};
}
export function getTrainingReadinessStatus(){return {stage:'prototype',targets:[...TARGETS],maxDatasets:100,trainingAuthorized:false,assessment:'heuristic screening with provisional quantity thresholds',independentVerification:false};}
