// G75: bounded local JSON persistence for owned prototype model artifacts.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=()=>process.env.BAYE_OWNED_MODEL_DIR||path.join(process.cwd(),'data','owned-models');
const idOk=id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id);
const canonical=payload=>JSON.stringify(payload);
export async function saveOwnedModel(payload){
 if(!payload||payload.algorithm!=='multinomial-naive-bayes'||!Array.isArray(payload.labels)||payload.labels.length<2||payload.labels.length>8||!payload.counts||!payload.totals||!payload.vocabulary)return {status:'rejected',error:'Invalid model artifact.'};
 const id=crypto.randomBytes(16).toString('hex'),body={id,createdAt:new Date().toISOString(),model:payload};const checksum=crypto.createHash('sha256').update(canonical(body)).digest('hex');const record={...body,checksum};const dir=root();await mkdir(dir,{recursive:true});const target=path.join(dir,id+'.json'),tmp=target+'.tmp';await writeFile(tmp,JSON.stringify(record),'utf8');await rename(tmp,target);return {status:'saved',id,checksum,createdAt:record.createdAt};
}
export async function loadOwnedModel(id){if(!idOk(id))return null;try{const raw=await readFile(path.join(root(),id+'.json'),'utf8');if(raw.length>2_000_000)return null;const record=JSON.parse(raw),body={id:record.id,createdAt:record.createdAt,model:record.model};const checksum=crypto.createHash('sha256').update(canonical(body)).digest('hex');if(record.id!==id||checksum!==record.checksum)return null;return record.model;}catch{return null;}}
export async function listOwnedModels(){try{const {readdir}=await import('node:fs/promises');const files=(await readdir(root())).filter(f=>/^[a-f0-9]{32}\\.json$/.test(f)).slice(0,100);const items=[];for(const f of files){const m=await loadOwnedModel(f.slice(0,-5));if(m)items.push({id:f.slice(0,-5),algorithm:m.algorithm,labels:m.labels,createdAt:m.createdAt||null});}return {items};}catch{return {items:[]};}}
export function ownedModelStorageStatus(){return {enabled:true,storage:'local-json-files',directoryConfigured:Boolean(process.env.BAYE_OWNED_MODEL_DIR),defaultPath:'./data/owned-models',checksum:'sha256',scope:'bounded prototype model artifacts; durability depends on host filesystem/persistent disk configuration'};}
