import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const MAX_SENTINEL_FILE_BYTES = 2 * 1024 * 1024;

export class SentinelHistoryStore {
  constructor({filePath=process.env.BAYE_SENTINEL_HISTORY_FILE||path.join(os.tmpdir(),'baye-sentinel-history.json'),maxEntries=100}={}) {
    if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>1000)throw new TypeError('maxEntries must be a positive safe integer.');
    if(typeof filePath!=='string'||!filePath.trim())throw new TypeError('filePath must be a non-empty string.');
    this.filePath=filePath;
    this.maxEntries=maxEntries;
  }

  async load() {
    try {
      const stat=await fs.stat(this.filePath);
      if(stat.size>MAX_SENTINEL_FILE_BYTES)throw new Error('SENTINEL history exceeds the configured size limit.');
      const parsed=JSON.parse(await fs.readFile(this.filePath,'utf8'));
      if (!Array.isArray(parsed)) throw new Error('Invalid SENTINEL history format.');
      return parsed.filter(entry=>this.#validEntry(entry)).slice(0,this.maxEntries);
    } catch(error) {
      if (error?.code==='ENOENT') return [];
      throw error;
    }
  }

  #validEntry(entry){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['checkedAt','overallOk','results','diagnostics'].includes(key))||typeof entry.checkedAt!=='string'||!Number.isFinite(Date.parse(entry.checkedAt))||typeof entry.overallOk!=='boolean'||!Array.isArray(entry.results))return false;
    const validResults=entry.results.length<=10&&entry.results.every(result=>result&&typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).every(key=>['name','ok','status','latencyMs','error'].includes(key))&&typeof result.name==='string'&&result.name.length<=200&&typeof result.ok==='boolean'&&(result.status===undefined||result.status===null||Number.isInteger(result.status))&&(result.latencyMs===undefined||result.latencyMs===null||(Number.isFinite(result.latencyMs)&&result.latencyMs>=0))&&(result.error===undefined||result.error===null||(typeof result.error==='string'&&result.error.length<=500)));
    const validDiagnostics=entry.diagnostics===undefined||(Array.isArray(entry.diagnostics)&&entry.diagnostics.length<=10&&entry.diagnostics.every(item=>item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).every(key=>['target','issue','recommendation'].includes(key))&&typeof item.target==='string'&&item.target.length<=200&&typeof item.issue==='string'&&item.issue.length<=500&&typeof item.recommendation==='string'&&item.recommendation.length<=500));
    return validResults&&validDiagnostics;
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
