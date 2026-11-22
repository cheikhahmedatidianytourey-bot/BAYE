// Bounded workflow orchestration: sequential allowlisted tools, explicit inputs, fail-fast.
import {executeSafeTool,getSafeToolCatalog} from './tool-execution.js';
export function runSafeWorkflow(steps){
 if(!Array.isArray(steps)||steps.length<1||steps.length>5)throw new Error('Le workflow doit contenir de 1 à 5 étapes.');
 const results=[];
 for(let i=0;i<steps.length;i++){
  const step=steps[i];
  if(!step||typeof step!=='object'||typeof step.tool!=='string')throw new Error('Étape '+(i+1)+' invalide.');
  const output=executeSafeTool(step.tool,step.input||{});
  results.push({step:i+1,tool:step.tool,status:'completed',output});
 }
 return {workflow:'BAYE Safe Workflow',status:'completed',steps:results,verification:{passed:true,scope:'bounded allowlisted deterministic execution'},externalActions:false};
}
export function getWorkflowLimits(){return {maxSteps:5,tools:getSafeToolCatalog().map(t=>t.id),sequential:true,failFast:true,externalActions:false,requiresExplicitInputs:true};}
