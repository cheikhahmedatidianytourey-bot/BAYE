import {createHash,randomUUID} from 'node:crypto';

const MAX_ENTRIES=5;
const MAX_EXCERPT=1800;
const MAX_PACKET_BYTES=12000;
function fail(message){throw new Error(message);}
function payloadFor(memory){return {version:memory.version,missionId:memory.missionId,entries:memory.entries};}
function digestFor(payload){return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
export function validateMissionMemory(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||typeof value.missionId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(value.missionId)||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES||typeof value.digest!=='string')fail('Mémoire de mission invalide.');
 const entries=value.entries.map(entry=>{
  if(!entry||typeof entry.taskId!=='string'||typeof entry.role!=='string'||typeof entry.excerpt!=='string'||entry.excerpt.length>MAX_EXCERPT)fail('Entrée de mémoire invalide.');
  return {taskId:entry.taskId,role:entry.role,excerpt:entry.excerpt};
 });
 const payload={version:1,missionId:value.missionId,entries};
 if(JSON.stringify(payload)!==JSON.stringify(payloadFor(value))||digestFor(payload)!==value.digest)fail('Empreinte de mémoire invalide.');
 if(JSON.stringify(value).length>MAX_PACKET_BYTES)fail('Mémoire de mission trop volumineuse.');
 return payload;
}
export function createMissionMemory({missionId,previous=null,results=[]}={}){
 const id=missionId||previous?.missionId||('mission_'+randomUUID().replace(/-/g,''));
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))fail('Identifiant de mission invalide.');
 const entries=[...(previous?.entries||[])];
 for(const row of results){
  if(row?.status!=='succeeded'||typeof row.output?.content!=='string')continue;
  entries.push({taskId:String(row.taskId).slice(0,100),role:String(row.output.role||'unknown').slice(0,40),excerpt:row.output.content.trim().slice(0,MAX_EXCERPT)});
 }
 const payload={version:1,missionId:id,entries:entries.slice(-MAX_ENTRIES)};
 const packet={...payload,digest:digestFor(payload)};
 if(JSON.stringify(packet).length>MAX_PACKET_BYTES)fail('Mémoire de mission trop volumineuse.');
 return packet;
}
