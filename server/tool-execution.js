// BAYE Safe Tool Execution v0.1 — allowlisted deterministic tools, no external side effects.
function parseMath(expression){
 if(typeof expression!=='string'||expression.length>300||!/^[0-9+\-*/().\s%]+$/.test(expression))throw new Error('Expression mathématique non autorisée.');
 let i=0;
 const skip=()=>{while(/\s/.test(expression[i]||''))i++;};
 function primary(){skip();if(expression[i]==='('){i++;const v=add();skip();if(expression[i]!==')')throw new Error('Parenthèse fermante manquante.');i++;return v;}let sign=1;if(expression[i]==='+'||expression[i]==='-'){if(expression[i]==='-')sign=-1;i++;}skip();const start=i;while(/[0-9.]/.test(expression[i]||''))i++;if(start===i)throw new Error('Nombre attendu.');const raw=expression.slice(start,i);if((raw.match(/\./g)||[]).length>1)throw new Error('Nombre invalide.');return sign*Number(raw);}
 function mul(){let v=primary();while(true){skip();const op=expression[i];if(op!=='*'&&op!=='/'&&op!=='%')break;i++;const b=primary();if((op==='/'||op==='%')&&b===0)throw new Error('Division par zéro.');v=op==='*'?v*b:op==='/'?v/b:v%b;}return v;}
 function add(){let v=mul();while(true){skip();const op=expression[i];if(op!=='+'&&op!=='-')break;i++;const b=mul();v=op==='+'?v+b:v-b;}return v;}
 const result=add();skip();if(i!==expression.length||!Number.isFinite(result))throw new Error('Expression invalide ou résultat non fini.');return result;
}
export function executeSafeTool(tool,input){
 if(tool==='calculator'){const expression=input?.expression;return {tool,result:parseMath(expression),verified:true,verification:'finite numeric result'};}
 if(tool==='text_stats'){const text=input?.text;if(typeof text!=='string'||text.length>10000)throw new Error('Texte requis (maximum 10 000 caractères).');const words=text.trim()?text.trim().split(/\s+/u).length:0;return {tool,characters:text.length,words,lines:text?text.split(/\r?\n/).length:0,verified:true};}
 throw new Error('Outil inconnu ou non autorisé.');
}
export function getSafeToolCatalog(){return [{id:'calculator',description:'Calcul arithmétique sur une expression limitée',input:{expression:'string'},externalSideEffects:false},{id:'text_stats',description:'Compte les caractères, mots et lignes d’un texte',input:{text:'string'},externalSideEffects:false}];}
