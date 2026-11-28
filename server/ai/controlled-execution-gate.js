// G64: deterministic execution-policy gate. Does not execute or dispatch jobs.
import crypto from 'node:crypto';
const ALLOWED=new Set(['dataset-validation','model-evaluation-plan','resource-inspection']);
const MAX_REF=160,MAX_MANIFEST_BYTES=8192;
export function inspectExecutionGate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',reason:'Policy input object required.'};
 if(!ALLOWED.has(input.taskType))return {status:'blocked',reason:'Task type is not allowlisted.'};
 if(typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>MAX_REF)return {status:'blocked',reason:'Bounded task reference required.'};
 if(input.manifest===undefined||input.manifest===null)return {status:'blocked',reason:'Manifest required for policy inspection.'};
 let serialized;try{serialized=JSON.stringify(input.manifest);}catch{return {status:'blocked',reason:'Manifest is not serializable.'};}
 if(typeof serialized!=='string'||serialized.length>MAX_MANIFEST_BYTES)return {status:'blocked',reason:'Manifest exceeds bounded policy size.'};
 const digest=crypto.createHash('sha256').update(serialized).digest('hex');
 const checks=[{name:'allowlisted-task',passed:true},{name:'bounded-reference',passed:true},{name:'bounded-manifest',passed:true},{name:'manifest-digest',passed:true}];
 const policyReceipt={taskType:input.taskType,reference:input.reference.trim(),manifestDigest:digest,checks,issuedAt:new Date().toISOString(),executionEnabled:false,dispatchEnabled:false,provisioningEnabled:false};
 return {status:'policy-inspected',receipt:policyReceipt,executionEnabled:false,dispatchEnabled:false,scope:'policy preflight only; no execution or worker dispatch'};
}
export function getExecutionGateStatus(){return {stage:'controlled-execution-policy-gate',allowlistedTaskTypes:[...ALLOWED],executionEnabled:false,dispatchEnabled:false,provisioningEnabled:false,scope:'preflight inspection only'};}
