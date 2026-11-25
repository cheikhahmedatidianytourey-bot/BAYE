// BAYE V6 Phase B — durable mission record storage (filesystem-backed).
// Each mission is stored as an individual JSON file and written via atomic rename.
import {mkdir,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateMission} from './mission-engine.js';

const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const clone=value=>structuredClone(value);

export class MissionStore {
 constructor({directory}={}) {
  if(typeof directory!=='string'||!directory.trim())throw new TypeError('Mission storage directory is required.');
  this.directory=directory;
  this.queue=Promise.resolve();
 }
 async init(){await mkdir(this.directory,{recursive:true});return this;}
 _file(id){if(!safeId(id))throw new TypeError('Unsafe mission ID.');return join(this.directory,id+'.json');}
 _serialize(fn){const run=this.queue.then(fn,fn);this.queue=run.catch(()=>{});return run;}
 async _read(id){try{return JSON.parse(await readFile(this._file(id),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
 async get(id){await this.init();const mission=await this._read(id);if(mission)validateMission(mission);return mission?clone(mission):null;}
 async create(mission){validateMission(mission);await this.init();return this._serialize(async()=>{
  const file=this._file(mission.id);if(await this._read(mission.id))throw new Error('Mission already exists.');
  await this._writeAtomic(file,mission);return clone(mission);
 });}
 async save(mission){validateMission(mission);await this.init();return this._serialize(async()=>{
  if(!await this._read(mission.id))throw new Error('Mission does not exist.');
  await this._writeAtomic(this._file(mission.id),mission);return clone(mission);
 });}
 async list(){await this.init();const names=await readdir(this.directory);const records=[];
  for(const name of names){if(!name.endsWith('.json'))continue;const id=name.slice(0,-5);if(!safeId(id))continue;const mission=await this._read(id);if(mission){validateMission(mission);records.push(mission);}}
  records.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));return clone(records);
 }
 async _writeAtomic(file,mission){const temp=file+'.'+randomUUID()+'.tmp';try{
  await (await import('node:fs/promises')).writeFile(temp,JSON.stringify(mission,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  await rename(temp,file);
 }catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}}
}
export function createMissionStore(options){return new MissionStore(options);}
