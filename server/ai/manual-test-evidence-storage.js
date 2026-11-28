// G68: durable, token-protected PostgreSQL manual-test evidence ledger.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {validateManualTestEvidence} from './manual-test-evidence.js';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false},max:3}):null;
const MAX_BYTES=16*1024,MAX_ROWS=10000;
export function manualEvidenceStorageReady(){return Boolean(pool);}
export function validatePersistentManualEvidence(input){
 const checked=validateManualTestEvidence(input);
 if(!checked.valid)return {status:'rejected',errors:checked.errors};
 const record={id:randomUUID(),...checked.normalized,recordedAt:new Date().toISOString()};
 if(Buffer.byteLength(JSON.stringify(record),'utf8')>MAX_BYTES)return {status:'rejected',errors:['record exceeds storage size limit']};
 return {status:'validated',record};
}
export async function initializeManualEvidenceStorage(){
 if(!pool)throw new Error('DATABASE_URL required');
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_manual_test_evidence (id TEXT PRIMARY KEY, feature_id TEXT NOT NULL, outcome TEXT NOT NULL, record JSONB NOT NULL, recorded_at TIMESTAMPTZ NOT NULL)`);
 await pool.query('CREATE INDEX IF NOT EXISTS baye_manual_evidence_feature_idx ON baye_manual_test_evidence(feature_id,recorded_at DESC)');
 await pool.query('CREATE INDEX IF NOT EXISTS baye_manual_evidence_outcome_idx ON baye_manual_test_evidence(outcome,recorded_at DESC)');
}
export async function persistManualEvidence(input){
 if(!pool)throw new Error('DATABASE_URL required');
 const checked=validatePersistentManualEvidence(input);if(checked.status!=='validated')return checked;
 const {record}=checked;
 const result=await pool.query('INSERT INTO baye_manual_test_evidence(id,feature_id,outcome,record,recorded_at) SELECT $1,$2,$3,$4::jsonb,$5 WHERE (SELECT count(*) FROM baye_manual_test_evidence)<$6 RETURNING id',[record.id,record.featureId,record.outcome,JSON.stringify(record),record.recordedAt,MAX_ROWS]);
 if(!result.rowCount)return {status:'capacity',limit:MAX_ROWS};
 return {status:'recorded',record};
}
export async function listPersistentManualEvidence({featureId='',outcome='',limit=50}={}){
 if(!pool)throw new Error('DATABASE_URL required');
 const n=Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50));
 const r=await pool.query('SELECT record FROM baye_manual_test_evidence WHERE ($1::text IS NULL OR feature_id=$1) AND ($2::text IS NULL OR outcome=$2) ORDER BY recorded_at DESC LIMIT $3',[featureId||null,outcome||null,n]);
 return {items:r.rows.map(x=>x.record),limit:n,storage:'postgresql',persistent:true};
}
export async function getPersistentManualEvidence(id){
 if(!pool)throw new Error('DATABASE_URL required');
 const r=await pool.query('SELECT record FROM baye_manual_test_evidence WHERE id=$1',[id]);return r.rows[0]?.record||null;
}
export async function getManualEvidenceStorageStatus(){
 if(!pool)return {configured:false,initialized:false,persistent:false,storage:'postgresql',capacity:MAX_ROWS};
 try{const r=await pool.query('SELECT count(*)::int AS count FROM baye_manual_test_evidence');return {configured:true,initialized:true,persistent:true,storage:'postgresql',recordCount:r.rows[0].count,capacity:MAX_ROWS};}catch{return {configured:true,initialized:false,persistent:true,storage:'postgresql',capacity:MAX_ROWS};}
}
