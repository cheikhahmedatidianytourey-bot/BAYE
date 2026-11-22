// BAYE Owned Runtime v0.1 — deterministic response composer, no external model/API.
import { classifyMission, buildMissionPlan } from './independent-core.js';

const domainGuidance={
 engineering:'Prioritize reproducible diagnosis, minimal changes, tests, and rollback safety.',
 creative:'Clarify audience, originality, format, constraints, and evaluation criteria.',
 research:'Separate verified facts, assumptions, uncertainties, and sources required.',
 planning:'Sequence milestones, dependencies, risks, measurable outcomes, and review points.',
 education:'Break learning into concepts, examples, practice, and feedback.',
 general:'Clarify the objective, constraints, and a practical next step.'
};
export function tokenize(text){
 if(typeof text!=='string')throw new TypeError('Text must be a string');
 return text.toLowerCase().match(/[\\p{L}\\p{N}]+/gu)||[];
}
export function runOwnedRuntime(input){
 if(typeof input!=='string'||!input.trim())throw new Error('Input required');
 if(input.length>4000)throw new Error('Input exceeds 4000 characters');
 const mission=input.trim();
 const domain=classifyMission(mission);
 const plan=buildMissionPlan(mission);
 return {
  runtime:'BAYE Owned Runtime',
  version:'0.1.0',
  mode:'deterministic composition',
  providerIndependent:true,
  generated:false,
  domain,
  tokenCount:tokenize(mission).length,
  response:{
   objective:mission,
   domain,
   guidance:domainGuidance[domain],
   plan:plan.steps.map(s=>s.action),
   limitations:['No trained neural model is used.','No external action is executed.','Claims requiring evidence remain unverified.']
  },
  executionAvailable:false
 };
}
