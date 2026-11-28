// G76: BAYE-owned deterministic Unicode tokenizer and corpus preparation.
import crypto from 'node:crypto';
const MAX_ITEMS=1000,MAX_TEXT=10000,MAX_TOKENS=2000,MAX_VOCAB=50000;
const tokenPattern=/[\\p{L}\\p{N}]+(?:['’][\\p{L}\\p{N}]+)?/gu;
export function tokenizeOwnedText(text,options={}){
 if(typeof text!=='string'||text.length>MAX_TEXT)return {status:'rejected',error:'Text must be a string of at most 10,000 characters.'};
 const normalized=text.normalize('NFKC').toLocaleLowerCase(options.locale||'und');
 const tokens=normalized.match(tokenPattern)||[];
 const filtered=options.stopWords instanceof Set?tokens.filter(t=>!options.stopWords.has(t)):tokens;
 return {status:'ok',tokens:filtered.slice(0,MAX_TOKENS)};
}
export function prepareOwnedCorpus(input,options={}){
 if(!Array.isArray(input)||input.length<1||input.length>MAX_ITEMS)return {status:'rejected',error:'Corpus must contain 1–1000 records.'};
 const records=[];
 for(let i=0;i<input.length;i++){const item=input[i];if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.text!=='string'||!item.text.trim()||item.text.length>MAX_TEXT||(item.label!==undefined&&(typeof item.label!=='string'||item.label.length>80))||(item.id!==undefined&&(typeof item.id!=='string'||item.id.length>128)))return {status:'rejected',error:'Invalid corpus record at index '+i+'.'};const result=tokenizeOwnedText(item.text,options);if(result.status!=='ok')return result;records.push({id:item.id??String(i),label:item.label??null,text:item.text.normalize('NFKC').trim(),tokens:result.tokens});}
 const vocab=[...new Set(records.flatMap(r=>r.tokens))].sort();if(!vocab.length||vocab.length>MAX_VOCAB)return {status:'rejected',error:'Vocabulary is empty or exceeds 50,000 tokens.'};
 return {status:'ok',records,vocabulary:vocab,stats:{records:records.length,tokenCount:records.reduce((n,r)=>n+r.tokens.length,0),vocabularySize:vocab.length},version:'g76-0.1.0'};
}
export function buildOwnedVocabulary(corpus){
 if(!corpus||corpus.status!=='ok'||!Array.isArray(corpus.vocabulary))return {status:'rejected',error:'Valid prepared corpus required.'};
 const payload={version:'g76-0.1.0',vocabulary:[...corpus.vocabulary],createdAt:corpus.createdAt??null};
 const checksum=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {status:'ok',...payload,checksum};
}
