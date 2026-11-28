import {randomUUID} from 'node:crypto';
import {validateManualTestEvidence} from './manual-test-evidence.js';
const MAX_RECORDS=500;
const records=[];
export function recordManualTest(input){const checked=validateManualTestEvidence(input);if(!checked.valid)return {status:'rejected',errors:checked.errors};if(records.length>=MAX_RECORDS)return {status:'capacity',limit:MAX_RECORDS};const record={id:randomUUID(),...checked.normalized,recordedAt:new Date().toISOString()};records.push(record);return {status:'recorded',record};}
export function listManualTests({featureId='',outcome='',limit=50}={}){const bounded=Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50));const filtered=records.filter(r=>(!featureId||r.featureId===featureId)&&(!outcome||r.outcome===outcome));return {items:filtered.slice(-bounded).reverse(),total:filtered.length,limit:bounded,storage:'process-memory',warning:'Records are volatile and may be lost on restart or instance replacement.'};}
export function getManualTest(id){return records.find(r=>r.id===id)||null;}
export function getManualTestLedgerStatus(){return {recordCount:records.length,capacity:MAX_RECORDS,storage:'process-memory',persistent:false};}
