// BAYE Memory Engine v0.3 — serialized mutations and private atomic file writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class MemoryEngine {
  constructor({filePath=process.env.BAYE_MEMORY_FILE||'/data/baye-memory.json',maxEntries=500}={}) {
    if(typeof filePath!=='string'||!filePath.trim())throw new TypeError('Memory file path must be a non-empty string.');
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>10000)throw new TypeError('maxEntries must be an integer between 1 and 10000.');
    this.filePath=filePath;this.maxEntries=maxEntries;this.mutationQueue=Promise.resolve();
  }
  async readAll(){
    try{
      const data=JSON.parse(await fs.readFile(this.filePath,'utf8'));
      if(!Array.isArray(data))throw new Error('Memory file format is invalid.');
      return data.filter(e=>e&&typeof e==='object'&&!Array.isArray(e)&&typeof e.id==='string'&&typeof e.text==='string'&&Array.isArray(e.tags)&&e.tags.every(t=>typeof t==='string'));
    }catch(err){if(err.code==='ENOENT')return [];throw err;}
  }
  async writeAll(entries){
    await fs.mkdir(path.dirname(this.filePath),{recursive:true,mode:0o700});
    const temp=this.filePath+'.'+crypto.randomUUID()+'.tmp';
    try{
      await fs.writeFile(temp,JSON.stringify(entries,null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
      await fs.rename(temp,this.filePath);
      await fs.chmod(this.filePath,0o600).catch(()=>{});
    }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  _serializeMutation(fn){
    const next=this.mutationQueue.then(fn,fn);
    this.mutationQueue=next.catch(()=>{});
    return next;
  }
  async add({text,tags=[]}={}){
    if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Memory text required (1-4000 characters).');
    if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.trim().length>50))throw new Error('Invalid tags.');
    const normalizedTags=[...new Set(tags.map(t=>t.trim()).filter(Boolean))];
    return this._serializeMutation(async()=>{
      const entries=await this.readAll();
      const item={id:crypto.randomUUID(),text:text.trim(),tags:normalizedTags,createdAt:new Date().toISOString()};
      entries.unshift(item);await this.writeAll(entries.slice(0,this.maxEntries));return item;
    });
  }
  async search(query=''){
    if(typeof query!=='string'||query.length>200)throw new Error('Invalid search query.');
    const entries=await this.readAll(),q=query.trim().toLowerCase();
    return entries.filter(e=>!q||e.text.toLowerCase().includes(q)||e.tags.some(t=>t.toLowerCase().includes(q))).slice(0,100);
  }
  async remove(id){
    if(typeof id!=='string'||!id||id.length>200)throw new Error('Memory id required.');
    return this._serializeMutation(async()=>{
      const entries=await this.readAll(),next=entries.filter(e=>e.id!==id);
      if(next.length===entries.length)return false;await this.writeAll(next);return true;
    });
  }
  async clear(){return this._serializeMutation(()=>this.writeAll([]));}
  async status(){return {name:'BAYE Memory Engine',version:'0.3.0',storage:'JSON file',entries:(await this.readAll()).length,maxEntries:this.maxEntries,persistenceNote:'Durability across redeploys requires a Render persistent disk mounted at this path.',enabled:true};}
}
