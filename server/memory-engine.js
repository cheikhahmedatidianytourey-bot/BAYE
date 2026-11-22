// BAYE Memory Engine v0.1 — JSON-backed, bounded, access-token protected.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class MemoryEngine {
  constructor({filePath=process.env.BAYE_MEMORY_FILE||'/data/baye-memory.json',maxEntries=500}={}) {
    this.filePath=filePath;this.maxEntries=maxEntries;
  }
  async readAll(){
    try{const data=JSON.parse(await fs.readFile(this.filePath,'utf8'));return Array.isArray(data)?data:[];}
    catch(err){if(err.code==='ENOENT')return [];throw err;}
  }
  async writeAll(entries){
    await fs.mkdir(path.dirname(this.filePath),{recursive:true});
    const temp=this.filePath+'.tmp';
    await fs.writeFile(temp,JSON.stringify(entries,null,2),'utf8');
    await fs.rename(temp,this.filePath);
  }
  async add({text,tags=[]}){
    if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Memory text required (1-4000 characters).');
    if(!Array.isArray(tags)||tags.length>20||tags.some(t=>typeof t!=='string'||t.length>50))throw new Error('Invalid tags.');
    const entries=await this.readAll();
    const item={id:crypto.randomUUID(),text:text.trim(),tags:tags.map(t=>t.trim()).filter(Boolean),createdAt:new Date().toISOString()};
    entries.unshift(item);await this.writeAll(entries.slice(0,this.maxEntries));return item;
  }
  async search(query=''){
    if(typeof query!=='string'||query.length>200)throw new Error('Invalid search query.');
    const entries=await this.readAll(),q=query.trim().toLowerCase();
    return entries.filter(e=>!q||e.text.toLowerCase().includes(q)||e.tags.some(t=>t.toLowerCase().includes(q))).slice(0,100);
  }
  async remove(id){
    if(typeof id!=='string'||!id)throw new Error('Memory id required.');
    const entries=await this.readAll(),next=entries.filter(e=>e.id!==id);
    if(next.length===entries.length)return false;await this.writeAll(next);return true;
  }
  async clear(){await this.writeAll([]);}
  async status(){return {name:'BAYE Memory Engine',version:'0.1.0',storage:'JSON file',filePath:this.filePath,entries:(await this.readAll()).length,maxEntries:this.maxEntries,persistenceNote:'Durability across redeploys requires a Render persistent disk mounted at this path.',enabled:true};}
}
