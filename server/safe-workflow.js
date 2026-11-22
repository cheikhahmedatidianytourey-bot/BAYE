// Bounded workflow orchestration with integrity receipts for deterministic tool results.
import {createHash} from 'node:crypto';
import {executeSafeTool,getSafeToolCatalog} from './tool-execution.js';

function receiptFor(output){
 return createHash('sha256').update(JSON.stringify(output)).digest('hex');
}
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
  const output=executeSafeTool(step.tool,step.input||{});
  results.push({step:i+1,tool:step.tool,status:'completed',output,receipt:receiptFor(output)});
 }
 const verification=verifyWorkflowReceipts(results);
 if(!verification.passed)throw new Error('Vérification des reçus du workflow échouée.');
 return {workflow:'BAYE Safe Workflow',status:'completed',steps:results,verification:{...verification,scope:'integrity checks over bounded allowlisted deterministic execution'},externalActions:false};
}
export function getWorkflowLimits(){return {maxSteps:5,tools:getSafeToolCatalog().map(t=>t.id),sequential:true,failFast:true,externalActions:false,requiresExplicitInputs:true,integrityReceipts:'SHA-256 per completed tool output'};}
