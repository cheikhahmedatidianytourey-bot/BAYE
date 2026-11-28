// G59: bounded reproducible training-experiment configuration; no training execution.
import crypto from 'node:crypto';
const TARGETS=new Set(['BAYE CORE MODEL','BAYE VISION','BAYE MOTION','BAYE AUDIO']);
const MODALITY={'BAYE CORE MODEL':['text','multimodal'],'BAYE VISION':['image','multimodal'],'BAYE MOTION':['video','multimodal'],'BAYE AUDIO':['audio','multimodal']};
const canonical=(v)=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const bounded=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
export function configureTrainingExperiment(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Experiment configuration object required.'};
 const target=input.targetModel;if(!TARGETS.has(target))return {status:'rejected',error:'Unknown target model.'};
 if(!Array.isArray(input.datasets)||input.datasets.length<1||input.datasets.length>50)return {status:'rejected',error:'Provide 1–50 dataset references.'};
 const datasets=[],issues=[];
 for(const [i,d] of input.datasets.entries()){
  if(!d||typeof d!=='object'||Array.isArray(d)){issues.push({index:i,code:'invalid-dataset-reference'});continue;}
  const name=bounded(d.name,120),modality=bounded(d.modality,30),receipt=bounded(d.receiptDigest,64),version=d.datasetVersion;
  if(!name||!MODALITY[target].includes(modality))issues.push({index:i,code:'name-or-modality-invalid'});
  if(!/^[a-f0-9]{64}$/i.test(receipt))issues.push({index:i,code:'receipt-digest-invalid'});
  if(!Number.isInteger(version)||version<1)issues.push({index:i,code:'dataset-version-invalid'});
  if(d.humanReviewApproved!==true)issues.push({index:i,code:'human-review-approval-required'});
  if(d.licenseReviewed!==true)issues.push({index:i,code:'license-review-required'});
  if(d.personalData===true&&d.privacyReview!=='completed')issues.push({index:i,code:'privacy-review-required'});
  if(d.personalData!==true&&d.personalData!==false)issues.push({index:i,code:'privacy-declaration-required'});
  datasets.push({name,modality,datasetVersion:version,receiptDigest:receipt.toLowerCase(),personalData:d.personalData});
 }
 if(new Set(datasets.map(d=>d.receiptDigest)).size!==datasets.length)issues.push({code:'duplicate-dataset-receipt'});
 const cfg=input.configuration&&typeof input.configuration==='object'&&!Array.isArray(input.configuration)?input.configuration:{};
 const epochs=cfg.epochs??1,batchSize=cfg.batchSize??8,learningRate=cfg.learningRate??0.0001,seed=cfg.seed??42,objective=bounded(cfg.objective,500);
 if(!Number.isInteger(epochs)||epochs<1||epochs>100)issues.push({code:'epochs-out-of-range'});
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>512)issues.push({code:'batch-size-out-of-range'});
 if(typeof learningRate!=='number'||!Number.isFinite(learningRate)||learningRate<=0||learningRate>1)issues.push({code:'learning-rate-out-of-range'});
 if(!Number.isInteger(seed)||seed<0||seed>2147483647)issues.push({code:'seed-invalid'});
 if(!objective)issues.push({code:'objective-required'});
 if(issues.length)return {status:'needs-review',issues,experimentCreated:false,trainingAuthorized:false};
 const manifest={schema:'baye-training-experiment-v1',targetModel:target,datasets,configuration:{epochs,batchSize,learningRate,seed,objective},createdFor:'configuration-and-reproducibility only'};
 const digest=crypto.createHash('sha256').update(canonical(manifest)).digest('hex');
 return {status:'configured',manifest,manifestDigest:digest,digestAlgorithm:'sha256',reproducibleManifest:true,experimentCreated:true,trainingAuthorized:false,executionEnabled:false,scope:'Configuration manifest only. Human approvals and supplied dataset receipt digests are declarations, not independently verified. No training or benchmarking performed.'};
}
export function getTrainingExperimentConfigStatus(){return {stage:'prototype',maxDatasets:50,targets:[...TARGETS],manifestSchema:'baye-training-experiment-v1',trainingAuthorized:false,executionEnabled:false,configuration:'bounded; deterministic SHA-256 manifest digest'};}
