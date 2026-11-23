import {createHash} from 'node:crypto';
import {mkdir,open,readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {validateMissionCheckpoint} from './mission-checkpoint.js';

const MAX_LEDGER_BYTES=2_000_000;
const MAX_RECORD_BYTES=200_000;
const ZERO_HASH='0'.repeat(64);
const fail=(m)=>{throw new Error(m);};
const digest=(value)=>createHash('sha256').update(value).digest('hex');
const safeOwner=/^[-a-zA-Z0-9_]{1,64}$/;
const safeMission=/^[-a-zA-Z0-9_]{1,64}$/;
function recordHash(record){return digest(JSON.stringify({sequence:record.sequence,previousHash:record.previousHash,checkpoint:record.checkpoint}));}
function parseLedger(text){
 if(!text)return [];
 const lines=text.split('\n');if(lines.at(-1)==='')lines.pop();
 const records=[];let previous=ZERO_HASH;
 for(let i=0;i<lines.length;i++){
  let record;try{record=JSON.parse(lines[i]);}catch{fail('Journal mission corrompu (JSON).');}
  if(!record||record.sequence!==i+1||record.previousHash!==previous||typeof record.hash!=='string'||record.hash!==recordHash(record))fail('Journal mission corrompu (intégrité ou chaîne).');
  previous=record.hash;records.push(record);
 }
 return records;
}
export function createDurableMissionLedger({directory}={}){
 if(typeof directory!=='string'||!directory.trim())fail('Répertoire ledger requis.');
 const queues=new Map();
 const fileFor=(owner,mission)=>join(directory,owner,mission+'.jsonl');
 async function readRecords(path){
  let content;try{content=await readFile(path,'utf8');}catch(err){if(err.code==='ENOENT')return [];throw err;}
  if(Buffer.byteLength(content)>MAX_LEDGER_BYTES)fail('Ledger trop volumineux.');
  return parseLedger(content);
 }
 function serialize(path,operation){
  const prior=queues.get(path)||Promise.resolve();
  const next=prior.catch(()=>{}).then(operation);queues.set(path,next);
  return next.finally(()=>{if(queues.get(path)===next)queues.delete(path);});
 }
 return Object.freeze({
  async load({ownerId,missionId,graphDigest}){
   if(!safeOwner.test(ownerId)||!safeMission.test(missionId))fail('Identifiant ledger invalide.');
   const records=await readRecords(fileFor(ownerId,missionId));if(!records.length)return null;
   return validateMissionCheckpoint(records.at(-1).checkpoint,{missionId,graphDigest});
  },
  async save({ownerId,checkpoint,expectedRevision,graphDigest}){
   if(!safeOwner.test(ownerId)||!safeMission.test(checkpoint?.missionId))fail('Identifiant ledger invalide.');
   const validated=validateMissionCheckpoint(checkpoint,{missionId:checkpoint?.missionId,graphDigest});
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision< -1)fail('Révision attendue invalide.');
   const path=fileFor(ownerId,validated.missionId);
   return serialize(path,async()=>{
    await mkdir(dirname(path),{recursive:true});
    const records=await readRecords(path),current=records.at(-1)?.checkpoint??null;
    if((current?.revision??-1)!==expectedRevision)fail('Conflit de révision ledger.');
    if(validated.revision!==expectedRevision+1)fail('La révision doit augmenter exactement de un.');
    const record={sequence:records.length+1,previousHash:records.at(-1)?.hash??ZERO_HASH,checkpoint:validated};
    record.hash=recordHash(record);const line=JSON.stringify(record)+'\n';
    if(Buffer.byteLength(line)>MAX_RECORD_BYTES)fail('Entrée ledger trop volumineuse.');
    const existingSize=records.length?Buffer.byteLength(await readFile(path)):0;
    if(existingSize+Buffer.byteLength(line)>MAX_LEDGER_BYTES)fail('Limite ledger atteinte.');
    const handle=await open(path,'a',0o600);
    try{await handle.write(line);await handle.sync();}finally{await handle.close();}
    return {checkpoint:validated,sequence:record.sequence,integrity:record.hash};
   });
  },
  async verify({ownerId,missionId}){
   if(!safeOwner.test(ownerId)||!safeMission.test(missionId))fail('Identifiant ledger invalide.');
   const records=await readRecords(fileFor(ownerId,missionId));
   return {valid:true,records:records.length,lastHash:records.at(-1)?.hash??null,revision:records.at(-1)?.checkpoint.revision??null};
  }
 });
}
