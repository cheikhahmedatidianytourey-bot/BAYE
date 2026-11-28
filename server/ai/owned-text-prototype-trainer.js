// G74: tiny owned CPU text classifier prototype (multinomial Naive Bayes).
// This is an experimental baseline, not a general-purpose language model.
// It uses caller-supplied bounded samples only; no network, filesystem, or external model.
const MAX_SAMPLES=600,MAX_TEXT=2000,MAX_LABELS=8,MAX_VOCAB=12000;
const tokenize=text=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0,300)||[];
function validateSplit(split,name){
 if(!Array.isArray(split)||split.length<1||split.length>MAX_SAMPLES)return {error:name+' split must contain 1–600 samples.'};
 const clean=[];
 for(const [i,item] of split.entries()){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.text!=='string'||!item.text.trim()||item.text.length>MAX_TEXT||typeof item.label!=='string'||!item.label.trim()||item.label.length>80)return {error:name+' sample '+i+' is invalid or exceeds limits.'};
  clean.push({text:item.text.trim(),label:item.label.trim()});
 }
 return {clean};
}
export function trainOwnedTextPrototype(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {status:'rejected',error:'Training request object required.'};
 const train=validateSplit(input.train,'train'),test=validateSplit(input.test,'test');
 if(train.error||test.error)return {status:'rejected',error:train.error||test.error};
 const labels=[...new Set(train.clean.map(x=>x.label))].sort();
 if(labels.length<2||labels.length>MAX_LABELS)return {status:'rejected',error:'Training split must contain 2–8 distinct labels.'};
 if(test.clean.some(x=>!labels.includes(x.label)))return {status:'rejected',error:'Test split contains a label not seen in training.'};
 const vocab=new Set(),docCounts=new Map(labels.map(l=>[l,0])),tokenCounts=new Map(labels.map(l=>[l,new Map()])),totalTokens=new Map(labels.map(l=>[l,0]));
 for(const item of train.clean){docCounts.set(item.label,docCounts.get(item.label)+1);for(const t of tokenize(item.text)){vocab.add(t);const m=tokenCounts.get(item.label);m.set(t,(m.get(t)||0)+1);totalTokens.set(item.label,totalTokens.get(item.label)+1);}}
 if(vocab.size===0||vocab.size>MAX_VOCAB)return {status:'rejected',error:'Vocabulary is empty or exceeds prototype limit.'};
 const prior=labels.map(l=>Math.log(docCounts.get(l)/train.clean.length));
 function predict(text){const tokens=tokenize(text);const scores=labels.map((l,i)=>{let score=prior[i];const counts=tokenCounts.get(l),denom=totalTokens.get(l)+vocab.size;for(const t of tokens)score+=Math.log((counts.get(t)||0)+1)-Math.log(denom);return score;});let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;return labels[best];}
 const confusion=Object.fromEntries(labels.map(l=>[l,Object.fromEntries(labels.map(x=>[x,0]))]));let correct=0;
 for(const item of test.clean){const p=predict(item.text);confusion[item.label][p]++;if(p===item.label)correct++;}
 const serialized={algorithm:'multinomial-naive-bayes',version:'0.1.0',labels,vocabulary:[...vocab],counts:Object.fromEntries(labels.map(l=>[l,Object.fromEntries(tokenCounts.get(l))])),totals:Object.fromEntries(labels.map(l=>[l,totalTokens.get(l)])),documents:Object.fromEntries(labels.map(l=>[l,docCounts.get(l)])),trainedOn:train.clean.length};\n return {status:'trained',modelArtifact:serialized,prototype:'BAYE-OWNED-TEXT-NB-0.1',algorithm:'multinomial-naive-bayes',execution:'CPU synchronous bounded prototype',trainedOn:train.clean.length,testSamples:test.clean.length,labels,vocabularySize:vocab.size,metrics:{accuracy:correct/test.clean.length,correct,total:test.clean.length,confusion},predictions:test.clean.map(item=>({expected:item.label,predicted:predict(item.text),correct:item.label===predict(item.text)})),limitations:['Tiny baseline classifier, not a language model or generative AI.','Model is process-local and not persisted.','Only caller-supplied text is processed; no external access.','Results require independent dataset and benchmark review.']};
}
export function getOwnedTextPrototypeStatus(){return {name:'BAYE Owned Text Prototype Trainer',version:'0.1.0',state:'experimental',algorithm:'multinomial-naive-bayes',trainingEnabled:true,execution:'bounded CPU synchronous',persistence:false,externalProvider:false,limits:{samplesPerSplit:MAX_SAMPLES,textCharsPerSample:MAX_TEXT,labels:MAX_LABELS,vocabulary:MAX_VOCAB},scope:'small text classification baseline only; not a language model'};}
\nexport function predictOwnedTextModel(model,text){if(!model||model.algorithm!=='multinomial-naive-bayes'||!Array.isArray(model.labels)||!Array.isArray(model.vocabulary)||typeof text!=='string')return {status:'rejected',error:'Invalid model or input.'};if(text.length>2000||model.labels.length>8||model.vocabulary.length>12000)return {status:'rejected',error:'Input or model exceeds bounds.'};const labels=model.labels,vocab=new Set(model.vocabulary),tokens=tokenize(text),counts=model.counts||{},totals=model.totals||{},documents=model.documents||{},totalDocs=Number(model.trainedOn)||1;const scores=labels.map(l=>{let s=Math.log(Math.max(1,Number(documents[l]))/totalDocs);const den=Number(totals[l])+vocab.size;for(const t of tokens)s+=Math.log((Number(counts[l]?.[t])||0)+1)-Math.log(den);return s;});let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;return {status:'predicted',label:labels[best],scores:Object.fromEntries(labels.map((l,i)=>[l,scores[i]]))};}\n