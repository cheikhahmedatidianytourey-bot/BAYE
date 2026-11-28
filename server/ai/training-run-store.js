// G61: PostgreSQL-backed persistent training run metadata store. No training execution.
import pg from 'pg';
import crypto from 'node:crypto';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false},max:3}):null;
const MAX=200, stages=new Set(['configured','review-pending','approved-for-future-execution','blocked']);
const clone=v=>JSON.parse(JSON.stringify(v));
export function trainingRunStoreReady(){return Boolean(pool);}
export async function initializeTrainingRunStore(){
 if(!pool)throw new Error('DATABASE_URL required');
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_training_runs (id UUID PRIMARY KEY, target_model TEXT NOT NULL, manifest_digest CHAR(64) NOT NULL, objective TEXT NOT NULL, dataset_refs JSONB NOT NULL, stage TEXT NOT NULL CHECK(stage IN ('configured','review-pending','approved-for-future-execution','blocked')), events JSONB NOT NULL, execution_enabled BOOLEAN NOT NULL DEFAULT FALSE CHECK(execution_enabled=FALSE), training_started BOOLEAN NOT NULL DEFAULT FALSE CHECK(training_started=FALSE), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query('CREATE INDEX IF NOT EXISTS baye_training_runs_created_idx ON baye_training_runs(created_at DESC)');
}
function validRecord(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {error:'Run record required.'};
 if(typeof input.id!=='string'||! /^[0-9a-f-]{36}$/i.test(input.id))return {error:'Run ID invalid.'};
 if(typeof input.manifestDigest!=='string'||!/^[a-f0-9]{64}$/i.test(input.manifestDigest))return {error:'Manifest digest invalid.'};
 if(typeof input.targetModel!=='string'||!input.targetModel.trim()||input.targetModel.length>80)return {error:'Target model invalid.'};
 if(typeof input.objective!=='string'||!input.objective.trim()||input.objective.length>500)return {error:'Objective invalid.'};
 if(!Array.isArray(input.datasetRefs)||input.datasetRefs.length<1||input.datasetRefs.length>50)return {error:'Dataset references must contain 1–50 items.'};
 if(!stages.has(input.stage))return {error:'Stage invalid.'};
 if(!Array.isArray(input.events)||input.events.length<1||input.events.length>100)return {error:'Event history invalid.'};
 return {valid:true};
}
export async function persistTrainingRun(record){
 if(!pool)throw new Error('DATABASE_URL unavailable');
 const v=validRecord(record);if(v.error)return {status:'rejected',error:v.error};
 const r=await pool.query(`INSERT INTO baye_training_runs(id,target_model,manifest_digest,objective,dataset_refs,stage,events,execution_enabled,training_started,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,FALSE,FALSE,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id`,[record.id,record.targetModel,record.manifestDigest.toLowerCase(),record.objective,record.datasetRefs,record.stage,record.events,record.createdAt,record.updatedAt]);
 return {status:r.rows.length?'stored':'duplicate',id:record.id,persistence:true,executionEnabled:false,trainingStarted:false};
}
function mapRow(row){return {id:row.id,targetModel:row.target_model,manifestDigest:row.manifest_digest.trim(),objective:row.objective,datasetRefs:row.dataset_refs,stage:row.stage,events:row.events,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),executionEnabled:false,trainingStarted:false};}
export async function readPersistentTrainingRun(id){if(!pool)throw new Error('DATABASE_URL unavailable');if(typeof id!=='string'||id.length>80)return null;const r=await pool.query('SELECT * FROM baye_training_runs WHERE id=$1',[id]);return r.rows[0]?mapRow(r.rows[0]):null;}
export async function listPersistentTrainingRuns(limit=50){if(!pool)throw new Error('DATABASE_URL unavailable');const n=Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50));const r=await pool.query('SELECT * FROM baye_training_runs ORDER BY created_at DESC LIMIT $1',[n]);return r.rows.map(mapRow);}
export async function updatePersistentTrainingRun(record){
 if(!pool)throw new Error('DATABASE_URL unavailable');
 const v=validRecord(record);if(v.error)return {status:'rejected',error:v.error};
 const r=await pool.query('UPDATE baye_training_runs SET stage=$2,events=$3,updated_at=$4 WHERE id=$1 RETURNING id',[record.id,record.stage,record.events,record.updatedAt]);
 return {status:r.rows.length?'updated':'not-found',id:record.id,persistence:true,executionEnabled:false,trainingStarted:false};
}
export async function getTrainingRunStoreStatus(){let count=null;if(pool){try{const r=await pool.query('SELECT COUNT(*)::int AS n FROM baye_training_runs');count=r.rows[0]?.n??null;}catch{count=null;}}return {stage:'prototype',storage:pool?'postgresql-configured':'postgresql-requires-DATABASE_URL',storedRuns:count,maxRunsPerListing:100,trainingStarted:false,executionEnabled:false,scope:'persistent run metadata and lifecycle history only; no worker, scheduling or training execution'};}
