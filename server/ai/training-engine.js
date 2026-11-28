// G60: in-memory training experiment lifecycle registry. No execution or training.
import crypto from 'node:crypto';
const store=new Map(),MAX=200;
const stages=new Set(['configured','review-pending','approved-for-future-execution','blocked']);
function clone(v){return JSON.parse(JSON.stringify(v));}
export function createTrainingRun(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Run manifest object required.'};
 if(typeof input.manifestDigest!=='string'||!/^[a-f0-9]{64}$/i.test(input.manifestDigest))return {status:'rejected',error:'Valid manifest digest required.'};
 if(typeof input.targetModel!=='string'||input.targetModel.length>80)return {status:'rejected',error:'Target model required.'};
 if(typeof input.objective!=='string'||!input.objective.trim()||input.objective.length>500)return {status:'rejected',error:'Bounded objective required.'};
 if(!Array.isArray(input.datasetRefs)||input.datasetRefs.length<1||input.datasetRefs.length>50)return {status:'rejected',error:'Provide 1–50 dataset receipt references.'};
 if(store.size>=MAX)return {status:'capacity',error:'Run registry capacity reached; no record was created.'};
 const id=crypto.randomUUID(),record={id,targetModel:input.targetModel,manifestDigest:input.manifestDigest.toLowerCase(),objective:input.objective.trim(),datasetRefs:input.datasetRefs.map(d=>({receiptDigest:typeof d?.receiptDigest==='string'?d.receiptDigest.slice(0,64):'',datasetVersion:Number.isInteger(d?.datasetVersion)?d.datasetVersion:null})),stage:'configured',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),events:[{stage:'configured',at:new Date().toISOString(),note:'Configuration recorded; no execution started.'}],executionEnabled:false,trainingStarted:false};
 store.set(id,record);return {status:'created',run:clone(record),executionEnabled:false};
}
export function transitionTrainingRun(input){
 if(!input||typeof input!=='object')return {status:'rejected',error:'Transition object required.'};
 const id=input.id,stage=input.stage,note=typeof input.note==='string'?input.note.trim().slice(0,240):'';
 if(!store.has(id))return {status:'not-found',error:'Run not found in this process registry.'};
 if(!stages.has(stage))return {status:'rejected',error:'Unsupported stage.'};
 if(stage==='approved-for-future-execution'&&input.humanApproval!==true)return {status:'blocked',error:'Explicit human approval declaration required.'};
 if(stage==='blocked'&&!note)return {status:'rejected',error:'A bounded reason is required to block a run.'};
 const record=store.get(id);if(record.stage==='blocked'&&stage!=='blocked')return {status:'blocked',error:'Blocked run cannot be reopened in this prototype.'};
 if(record.stage==='approved-for-future-execution'&&stage!=='blocked')return {status:'blocked',error:'Approved status is terminal in this prototype.'};
 const at=new Date().toISOString();record.stage=stage;record.updatedAt=at;record.events.push({stage,at,note:note||'Stage updated.',humanApprovalDeclared:stage==='approved-for-future-execution'});store.set(id,record);
 return {status:'updated',run:clone(record),executionEnabled:false,trainingStarted:false,scope:'Lifecycle metadata only; approval does not authorize or initiate training.'};
}
export function getTrainingRun(id){const r=store.get(id);return r?clone(r):null;}
export function listTrainingRuns(limit=50){const n=Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50));return [...store.values()].slice(-n).reverse().map(clone);}
export function getTrainingEngineStatus(){return {stage:'prototype',registry:'process-local volatile memory',maxRuns:MAX,storedRuns:store.size,runStages:[...stages],trainingStarted:false,executionEnabled:false,persistence:false,scope:'experiment lifecycle and audit event metadata only; no scheduler, workers, training, or model execution'};}
