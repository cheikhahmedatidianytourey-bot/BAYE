// G80: controlled repair proposal gate. This module never applies patches or writes files.
const MAX_PATCH_BYTES=12000,MAX_PATH=240,MAX_REASON=600,MAX_FILES=8;
const FORBIDDEN_PATHS=/^(?:\.git|\.github\/workflows|node_modules|\.env|secrets?)(?:\/|$)/i;
const ALLOWED_EXT=/\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|sql|css|html)$/i;
function safePath(path){
 if(typeof path!=='string'||!path.trim()||path.length>MAX_PATH)return false;
 if(path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'))return false;
 if(FORBIDDEN_PATHS.test(path)||!ALLOWED_EXT.test(path))return false;
 return true;
}
export function validateRepairProposal(proposal){
 if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))return {status:'rejected',errors:['proposal object required']};
 const errors=[];
 if(typeof proposal.id!=='string'||!proposal.id.trim()||proposal.id.length>120)errors.push('valid proposal id required');
 if(typeof proposal.incidentId!=='string'||!proposal.incidentId.trim()||proposal.incidentId.length>120)errors.push('incidentId required');
 if(typeof proposal.diagnosisCode!=='string'||!proposal.diagnosisCode.trim()||proposal.diagnosisCode.length>80)errors.push('diagnosisCode required');
 if(typeof proposal.reason!=='string'||!proposal.reason.trim()||proposal.reason.length>MAX_REASON)errors.push('reason must contain 1–600 characters');
 if(!Array.isArray(proposal.changes)||proposal.changes.length<1||proposal.changes.length>MAX_FILES)errors.push('changes must contain 1–8 files');
 else{
  const seen=new Set();
  for(const [i,c] of proposal.changes.entries()){
   if(!c||typeof c!=='object'||!safePath(c.path)){errors.push('change '+i+' has an unsafe path');continue;}
   if(seen.has(c.path))errors.push('duplicate change path');seen.add(c.path);
   if(c.operation!=='modify'&&c.operation!=='add')errors.push('change '+i+' operation must be add or modify');
   if(typeof c.patch!=='string'||!c.patch.trim()||Buffer.byteLength(c.patch,'utf8')>MAX_PATCH_BYTES)errors.push('change '+i+' patch is empty or exceeds 12KB');
   else if(c.patch.includes('\u0000')||c.patch.split('\n').some(line=>line.length>2000))errors.push('change '+i+' patch contains unsupported content');
  }
 }
 if(errors.length)return {status:'rejected',errors};
 return {status:'validated',proposalId:proposal.id,fileCount:proposal.changes.length,patchBytes:proposal.changes.reduce((n,c)=>n+Buffer.byteLength(c.patch,'utf8'),0)};
}
export function evaluateRepairGate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',errors:['input object required']};
 const checked=validateRepairProposal(input.proposal);if(checked.status!=='validated')return checked;
 const blockers=[];
 if(input.humanApproval!==true)blockers.push('explicit human approval is required');
 if(input.testsPassed!==true)blockers.push('all required validation tests must pass');
 if(input.diagnosisConfirmed!==true)blockers.push('diagnosis must be confirmed against evidence');
 if(input.backupVerified!==true)blockers.push('a recoverable backup or rollback point must be verified');
 return {status:blockers.length?'blocked':'eligible_for_manual_review',proposalId:checked.proposalId,fileCount:checked.fileCount,blockers,execution:{applied:false,filesWritten:0,requiresSeparateExecutionCapability:true},safety:{automaticExecution:false,networkAccess:false,repositoryWriteAccess:false},notice:'Eligibility is not execution. This engine only evaluates a repair proposal; a separate authorized system and review are required to apply it.'};
}
export function getControlledRepairStatus(){return {name:'BAYE Controlled Self-Repair Gate',milestone:'G80',version:'0.1.0',mode:'proposal validation and approval gating only',limits:{maxFiles:MAX_FILES,maxPatchBytesPerFile:MAX_PATCH_BYTES},appliesPatches:false,writesFiles:false,networkAccess:false,repositoryWriteAccess:false};}
