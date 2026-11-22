import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class SentinelHistoryStore {
  constructor({filePath=process.env.BAYE_SENTINEL_HISTORY_FILE||'/data/baye-sentinel-history.json',maxEntries=100}={}) {
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1)throw new TypeError('maxEntries must be a positive safe integer.');
    if(typeof filePath!=='string'||!filePath.trim())throw new TypeError('filePath must be a non-empty string.');
    this.filePath=filePath;
    this.maxEntries=maxEntries;
  }

  async load() {
    try {
      const parsed=JSON.parse(await fs.readFile(this.filePath,'utf8'));
      if (!Array.isArray(parsed)) throw new Error('Invalid SENTINEL history format.');
      return parsed.filter(entry=>this.#validEntry(entry)).slice(0,this.maxEntries);
    } catch(error) {
      if (error?.code==='ENOENT') return [];
      throw error;
    }
  }

  #validEntry(entry){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.checkedAt!=='string'||!Number.isFinite(Date.parse(entry.checkedAt))||typeof entry.overallOk!=='boolean'||!Array.isArray(entry.results))return false;
    return entry.results.length<=10&&entry.results.every(result=>result&&typeof result==='object'&&!Array.isArray(result)&&typeof result.name==='string'&&result.name.length<=200&&typeof result.ok==='boolean');
  }

  async save(entries) {
    if (!Array.isArray(entries)) throw new TypeError('SENTINEL history must be an array.');
    if(entries.some(entry=>!this.#validEntry(entry)))throw new TypeError('SENTINEL history contains an invalid entry.');
    await fs.mkdir(path.dirname(this.filePath),{recursive:true,mode:0o700});
    const temp=`${this.filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temp,JSON.stringify(entries.slice(0,this.maxEntries),null,2),{encoding:'utf8',mode:0o600,flag:'wx'});
      await fs.rename(temp,this.filePath);
    } finally {
      await fs.rm(temp,{force:true}).catch(()=>{});
    }
  }
}
