import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class SentinelHistoryStore {
  constructor({filePath=process.env.BAYE_SENTINEL_HISTORY_FILE||'/data/baye-sentinel-history.json',maxEntries=100}={}) {
    this.filePath=filePath;
    this.maxEntries=maxEntries;
  }

  async load() {
    try {
      const parsed=JSON.parse(await fs.readFile(this.filePath,'utf8'));
      if (!Array.isArray(parsed)) throw new Error('Invalid SENTINEL history format.');
      return parsed.slice(0,this.maxEntries);
    } catch(error) {
      if (error?.code==='ENOENT') return [];
      throw error;
    }
  }

  async save(entries) {
    if (!Array.isArray(entries)) throw new TypeError('SENTINEL history must be an array.');
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
