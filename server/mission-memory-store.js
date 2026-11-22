import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateMissionMemory} from './mission-memory.js';

const MAX_FILE_BYTES=4*1024*1024;
const MAX_RECORDS=1000;
const DEFAULT_TTL_MS=30*24*60*60*1000;
const OWNER_ID_PATTERN=/^[a-zA-Z0-9._:@-]{8,200}$/;
const MISSION_ID_PATTERN=/^[a-zA-Z0-9_-]{8,100}$/;

function ownerKeyFor(ownerId){
 if(typeof ownerId!=='string'||!OWNER_ID_PATTERN.test(ownerId))throw new Error('Authenticated owner identifier is invalid.');
 return crypto.createHash('sha256').update(ownerId).digest('hex');
}
function validateOptions({filePath,ttlMs,maxRecords}){
 if(typeof filePath!=='string'||!filePath.trim())throw new TypeError('Mission memory file path is required.');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<60_000||ttlMs>365*24*60*60*1000)throw new TypeError('ttlMs must be between one minute and one year.');
 if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>MAX_RECORDS)throw new TypeError('maxRecords is outside the supported range.');
}
function validateRecord(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||! /^[a-f0-9]{64}$/.test(row.ownerKey)||typeof row.missionId!=='string'||!MISSION_ID_PATTERN.test(row.missionId)||typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))return false;
 try{return validateMissionMemory(row.memory).missionId===row.missionId;}catch{return false;}
}

export class PersistentMissionMemoryStore{
 constructor({filePath=process.env.BAYE_MISSION_MEMORY_FILE||'/data/baye-mission-memory.json',ttlMs=DEFAULT_TTL_MS,maxRecords=MAX_RECORDS}={}){
  validateOptions({filePath,ttlMs,maxRecords});
  this.filePath=filePath;this.ttlMs=ttlMs;this.maxRecords=maxRecords;this.mutationQueue=Promise.resolve();
 }
 async readAll(){
  try{
   const stat=await fs.stat(this.filePath);
   if(stat.size>MAX_FILE_BYTES)throw new Error('Mission memory store exceeds the file size limit.');
   const parsed=JSON.parse(await fs.readFile(this.filePath,'utf8'));
   if(!parsed||parsed.version!==1||!Array.isArray(parsed.records)||parsed.records.length>MAX_RECORDS||!parsed.records.every(validateRecord))throw new Error('Mission memory store is corrupt or has an unsupported format.');
   return parsed.records;
  }catch(err){if(err.code==='ENOENT')return [];throw err;}
 }
 async writeAll(records){
  await fs.mkdir(path.dirname(this.filePath),{recursive:true,mode:0o700});
  const temp=this.filePath+'.'+crypto.randomUUID()+'.tmp';
  try{
   await fs.writeFile(temp,JSON.stringify({version:1,records}),{encoding:'utf8',mode:0o600,flag:'wx'});
   await fs.rename(temp,this.filePath);
   await fs.chmod(this.filePath,0o600).catch(()=>{});
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
 }
 serialize(fn){
  const next=this.mutationQueue.then(fn,fn);
  this.mutationQueue=next.catch(()=>{});
  return next;
 }
 prune(records,now=Date.now()){
  return records.filter(row=>now-Date.parse(row.updatedAt)<=this.ttlMs).slice(0,this.maxRecords);
 }
 async save({ownerId,memory}={}){
  const ownerKey=ownerKeyFor(ownerId);
  const validated=validateMissionMemory(memory);
  return this.serialize(async()=>{
   const now=new Date().toISOString();
   const records=this.prune(await this.readAll()).filter(row=>!(row.ownerKey===ownerKey&&row.missionId===validated.missionId));
   records.unshift({ownerKey,missionId:validated.missionId,updatedAt:now,memory});
   await this.writeAll(records.slice(0,this.maxRecords));
   return {missionId:validated.missionId,updatedAt:now,entryCount:validated.entries.length};
  });
 }
 async load({ownerId,missionId}={}){
  const ownerKey=ownerKeyFor(ownerId);
  if(typeof missionId!=='string'||!MISSION_ID_PATTERN.test(missionId))throw new Error('Mission identifier is invalid.');
  const records=this.prune(await this.readAll());
  const found=records.find(row=>row.ownerKey===ownerKey&&row.missionId===missionId);
  return found?{missionId:found.missionId,updatedAt:found.updatedAt,memory:found.memory}:null;
 }
 async remove({ownerId,missionId}={}){
  const ownerKey=ownerKeyFor(ownerId);
  if(typeof missionId!=='string'||!MISSION_ID_PATTERN.test(missionId))throw new Error('Mission identifier is invalid.');
  return this.serialize(async()=>{
   const records=this.prune(await this.readAll());
   const next=records.filter(row=>!(row.ownerKey===ownerKey&&row.missionId===missionId));
   if(next.length===records.length)return false;
   await this.writeAll(next);return true;
  });
 }
 async status(){
  const records=this.prune(await this.readAll());
  return {name:'BAYE Persistent Mission Memory Store',version:'1.0.0',storage:'atomic JSON file',records:records.length,maxRecords:this.maxRecords,ttlMs:this.ttlMs,ownerIsolation:'SHA-256 namespace derived from authenticated owner identifier',concurrencyScope:'single-process only',multiInstanceSafe:false,enabled:true};
 }
}
