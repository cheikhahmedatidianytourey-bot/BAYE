// Validate structured evidence from BAYE manual feature tests. This is a contract, not a persistence or certification layer.
const outcomes=new Set(['passed','failed','blocked','not-tested']);
const maxText=2000, maxEvidence=10;
export function validateManualTestEvidence(input={}){
 const errors=[];
 if(!input||typeof input!=='object'||Array.isArray(input)) return {valid:false,errors:['record must be an object']};
 if(typeof input.featureId!=='string'||!input.featureId.trim()||input.featureId.length>120) errors.push('featureId must be a non-empty string up to 120 characters');
 if(typeof input.testCase!=='string'||!input.testCase.trim()||input.testCase.length>maxText) errors.push('testCase must be a non-empty string up to 2000 characters');
 if(!outcomes.has(input.outcome)) errors.push('outcome must be passed, failed, blocked or not-tested');
 if(typeof input.notes!=='string'||input.notes.length>maxText) errors.push('notes must be a string up to 2000 characters');
 if(!Array.isArray(input.evidenceRefs)||input.evidenceRefs.length>maxEvidence||input.evidenceRefs.some(x=>typeof x!=='string'||x.length>500)) errors.push('evidenceRefs must be an array of up to 10 strings (500 characters each)');
 if(input.testedAt!==undefined&&(typeof input.testedAt!=='string'||Number.isNaN(Date.parse(input.testedAt)))) errors.push('testedAt must be a valid date string when supplied');
 if(input.tester!==undefined&&(typeof input.tester!=='string'||input.tester.length>120)) errors.push('tester must be a string up to 120 characters when supplied');
 if(input.outcome==='failed'&&!input.notes.trim()) errors.push('failed tests require notes describing the defect');
 return {valid:errors.length===0,errors,normalized:errors.length?undefined:{featureId:input.featureId.trim(),testCase:input.testCase.trim(),outcome:input.outcome,notes:input.notes.trim(),evidenceRefs:[...input.evidenceRefs],testedAt:input.testedAt??null,tester:input.tester??null}};
}
