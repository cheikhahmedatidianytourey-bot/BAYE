// Independent deterministic verification for bounded BAYE tools.
// Recomputes results from original inputs; this is not an external or model-based verifier.
function parseSafeNumber(value){
 if(typeof value!=='number'||!Number.isFinite(value))return false;
 return true;
}
export function verifyToolResult(tool,input,output){
 const issues=[];
 if(!input||typeof input!=='object'||!output||typeof output!=='object')return {passed:false,tool,issues:['Input/output must be objects'],verification:'independent deterministic recomputation'};
 if(tool==='calculator'){
  if(typeof input.expression!=='string'||input.expression.length>300||!/^[0-9+\-*/().\s%]+$/.test(input.expression))issues.push('Original calculator input is invalid');
  else if(!parseSafeNumber(output.result))issues.push('Result is not a finite number');
  else if(output.tool!=='calculator')issues.push('Tool identity mismatch');
  else if(output.verified!==true)issues.push('Execution verification flag missing');
  // Recompute via a deliberately separate bounded arithmetic evaluator.
  else {
   const expected=evaluate(input.expression);
   if(expected===null)issues.push('Independent recomputation rejected expression');
   else if(expected!==output.result)issues.push('Recomputed result differs from claimed result');
  }
 }else if(tool==='text_stats'){
  const raw=input.text;
  if(typeof raw!=='string'||raw.length>10000)issues.push('Original text input invalid');
  else{
   const words=raw.trim()?raw.trim().split(/\s+/u).length:0;
   const lines=raw?raw.split(/\r?\n/).length:0;
   if(output.tool!=='text_stats')issues.push('Tool identity mismatch');
   if(output.characters!==raw.length)issues.push('Character count mismatch');
   if(output.words!==words)issues.push('Word count mismatch');
   if(output.lines!==lines)issues.push('Line count mismatch');
  }
 }else issues.push('Tool not supported by independent verifier');
 return {passed:issues.length===0,tool,issues,verification:'independent deterministic recomputation'};
}
// Restricted arithmetic parser separate from tool-execution implementation.
function evaluate(s){
 let p=0;
 const ws=()=>{while(/\s/.test(s[p]||''))p++;};
 function factor(){ws();let sign=1;if(s[p]==='+'||s[p]==='-'){if(s[p]==='-')sign=-1;p++;}ws();let n;if(s[p]==='('){p++;n=expr();ws();if(s[p]!==')')throw Error();p++;}else{const start=p;while(/[0-9.]/.test(s[p]||''))p++;if(start===p)throw Error();const v=s.slice(start,p);if((v.match(/\./g)||[]).length>1)throw Error();n=Number(v);}return sign*n;}
 function term(){let n=factor();while(true){ws();const op=s[p];if(op!=='*'&&op!=='/'&&op!=='%')break;p++;const b=factor();if((op==='/'||op==='%')&&b===0)throw Error();n=op==='*'?n*b:op==='/'?n/b:n%b;}return n;}
 function expr(){let n=term();while(true){ws();const op=s[p];if(op!=='+'&&op!=='-')break;p++;const b=term();n=op==='+'?n+b:n-b;}return n;}
 try{const n=expr();ws();return p===s.length&&Number.isFinite(n)?n:null;}catch{return null;}
}
