// G61: PostgreSQL persistence adapter for training-run lifecycle records.
// This module exposes storage primitives; it does not launch or execute training.
import pg from 'pg';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false},max:3}):null;
const MAX_JSON_BYTES=64*1024;
function boundedRecord(record){
 if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Run record object required.');
 const encoded=JSON.stringify(record);
 if(encoded.length>MAX_JSON_BYTES)throw new Error('Run record exceeds storage size limit.');
 if(typeof record.id!=='string'||record.id.length>80)throw new Error('Run ID required.');
 if(typeof record.manifestDigest!=='string'||!/^[a-f0-9]{64}$/i.test(record.manifestDigest))throw new Error('Valid manifest digest required.');
 if(!Array.isArray(record.events)||record.events.length>500)throw new Error('Bounded event history required.');
 return encoded;
}
export function trainingRunStorageReady(){return Boolean(pool);}
export async function initializeTrainingRunStorage(){
 if(!pool)throw new Error('DATABASE_URL required.');
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_training_runs (
 run_id TEXT PRIMARY KEY, manifest_digest CHAR(64) NOT NULL, stage TEXT NOT NULL,
 record JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_training_run_events (
 event_id BIGSERIAL PRIMARY KEY, run_id TEXT NOT NULL REFERENCES baye_training_runs(run_id) ON DELETE CASCADE,
 stage TEXT NOT NULL, event JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL
 )`);
 await pool.query('CREATE INDEX IF NOT EXISTS baye_training_runs_updated_idx ON baye_training_runs(updated_at DESC)');
 await pool.query('CREATE INDEX IF NOT EXISTS baye_training_run_events_idx ON baye_training_run_events(run_id,event_id)');
}
export async function saveTrainingRunRecord(record){
 if(!pool)throw new Error('DATABASE_URL required.');
 const encoded=boundedRecord(record),client=await pool.connect();
 try{await client.query('BEGIN');
 const result=await client.query('INSERT INTO baye_training_runs(run_id,manifest_digest,stage,record,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,$6) ON CONFLICT(run_id) DO UPDATE SET manifest_digest=EXCLUDED.manifest_digest,stage=EXCLUDED.stage,record=EXCLUDED.record,updated_at=EXCLUDED.updated_at WHERE baye_training_runs.manifest_digest=EXCLUDED.manifest_digest RETURNING run_id',[record.id,record.manifestDigest,record.stage,encoded,record.createdAt,record.updatedAt]);
 if(!result.rowCount)throw new Error('Run ID collision with a different manifest digest.');
 await client.query('DELETE FROM baye_training_run_events WHERE run_id=$1',[record.id]);
 for(const event of record.events)await client.query('INSERT INTO baye_training_run_events(run_id,stage,event,created_at) VALUES($1,$2,$3::jsonb,$4)',[record.id,String(event.stage||record.stage),JSON.stringify(event),event.at||record.updatedAt]);
 await client.query('COMMIT');return {stored:true,runId:record.id};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function getStoredTrainingRun(id){
 if(!pool)throw new Error('DATABASE_URL required.');
 const r=await pool.query('SELECT record FROM baye_training_runs WHERE run_id=$1',[id]);
 return r.rows[0]?.record||null;
}
export async function listStoredTrainingRuns(limit=50){
 if(!pool)throw new Error('DATABASE_URL required.');
 const n=Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50));
 const r=await pool.query('SELECT record FROM baye_training_runs ORDER BY updated_at DESC LIMIT $1',[n]);
 return r.rows.map(x=>x.record);
}
export async function getTrainingRunStorageStatus(){
 return {storage:'postgresql',configured:trainingRunStorageReady(),initialized:trainingRunStorageReady(),persistent:trainingRunStorageReady(),schema:'baye_training_runs + baye_training_run_events',maxRecordBytes:MAX_JSON_BYTES,maxList:100,executionEnabled:false,trainingStarted:false,scope:'storage adapter foundation; no training execution or worker'};
}
