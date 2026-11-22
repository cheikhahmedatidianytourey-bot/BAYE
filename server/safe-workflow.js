// Bounded workflow orchestration with integrity receipts and independent recomputation.
import {createHash} from 'node:crypto';
import {executeSafeTool,getSafeToolCatalog} from './tool-execution.js';
import {verifyToolResult} from './independent-verifier.js';
function receiptFor(output){return createHash('sha256').update(JSON.stringify(output)).digest('hex');}
export function verifyWorkflowReceipts(steps){
 if(!Array.isArray(steps))return {passed:false,verified:0,total:0};
 let verified=0;
 for(const step of steps){
  if(!step||step.status!=='completed'||typeof step.receipt!=='string'||!step.output)return {passed:false,verified,total:steps.length};
  if(receiptFor(step.output)!==step.receipt)return {passed:false,verified,total:steps.length};
  verified++;
 }
 return {passed:verified===steps.length,verified,total:steps.length,algorithm:'SHA-256'};
}
export function runSafeWorkflow(steps){
 if(!Array.isArray(steps)||steps.length<1||steps.length>5)throw new Error('Le workflow doit contenir de 1 à 5 étapes.');
 const results=[];
 for(let i=0;i<steps.length;i++){
  const step=steps[i];
  if(!step||typeof step!=='object'||typeof step.tool!=='string')throw new Error('Étape '+(i+1)+' invalide.');
  const input=step.input||{},output=executeSafeTool(step.tool,input);
  const independent=verifyToolResult(step.tool,input,output);
  if(!independent.passed)throw new Error('Vérification indépendante échouée à l’étape '+(i+1)+': '+independent.issues.join('; '));
  results.push({step:i+1,tool:step.tool,status:'completed',input,output,receipt:receiptFor(output),independentVerification:independent});
 }
 const verification=verifyWorkflowReceipts(results);
 if(!verification.passed)throw new Error('Vérification des reçus du workflow échouée.');
 return {workflow:'BAYE Safe Workflow',status:'completed',steps:results,verification:{...verification,independent:true,scope:'independent deterministic recomputation for allowlisted tools plus integrity receipts'},externalActions:false};
}
export function getWorkflowLimits(){return {maxSteps:5,tools:getSafeToolCatalog().map(t=>t.id),sequential:true,failFast:true,externalActions:false,requiresExplicitInputs:true,integrityReceipts:'SHA-256 per completed tool output',independentVerification:'recomputes calculator and text statistics from original inputs'};}
