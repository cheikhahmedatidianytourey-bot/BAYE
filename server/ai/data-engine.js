// BAYE DATA ENGINE foundation: dataset metadata validation only, no ingestion or training.
const MAX_RECORDS=100;
const allowedSplits=['train','validation','test'];
export function validateDatasetRecord(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Dataset record must be an object.'};
 const fields=['name','description','source','license','modality'];
 for(const f of fields)if(typeof input[f]!=='string'||!input[f].trim()||input[f].length>(f==='description'?1000:200))return {valid:false,error:f+' is required and bounded.'};
 if(!['text','image','video','audio','multimodal'].includes(input.modality))return {valid:false,error:'Unsupported modality.'};
 if(!Array.isArray(input.splits)||input.splits.length!==3||input.splits.some(x=>!x||typeof x!=='object'||!allowedSplits.includes(x.name)||!Number.isFinite(x.ratio)||x.ratio<=0||x.ratio>=1)||new Set(input.splits.map(x=>x.name)).size!==3)return {valid:false,error:'Provide train, validation and test split ratios.'};
 const sum=input.splits.reduce((s,x)=>s+x.ratio,0);if(Math.abs(sum-1)>0.001)return {valid:false,error:'Split ratios must sum to 1.'};
 if(input.recordCount!==undefined&&(!Number.isInteger(input.recordCount)||input.recordCount<0||input.recordCount>1e12))return {valid:false,error:'recordCount must be a non-negative bounded integer.'};
 if(input.personalData!==undefined&&typeof input.personalData!=='boolean')return {valid:false,error:'personalData must be boolean.'};
 return {valid:true,manifest:{name:input.name.trim(),description:input.description.trim(),source:input.source.trim(),license:input.license.trim(),modality:input.modality,recordCount:input.recordCount??null,personalData:input.personalData??false,splits:input.splits.map(x=>({name:x.name,ratio:x.ratio})),stage:'metadata-only',ingestionEnabled:false,trainingEnabled:false}};
}
export function getDataEngineStatus(){return {engine:'BAYE DATA ENGINE',stage:'foundation',datasetRegistry:'metadata-validation-only',ingestion:'not-implemented',curation:'not-implemented',training:'not-implemented',maxDatasetRecords:MAX_RECORDS,executionEnabled:false,principles:['Document source and license','Explicitly declare personal-data presence','Separate train, validation and test splits','Do not imply dataset access from metadata']};}
