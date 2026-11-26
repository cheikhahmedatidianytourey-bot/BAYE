// BAYE V6 G9 — PostgreSQL-backed MissionStore with transactional task synchronization.
// The caller owns the Pool lifecycle and must apply the explicit schema migration first.
import {validateMission} from './mission-engine.js';

const clone=value=>structuredClone(value);
const ownerId=mission=>mission.ownerRef||'system';

async function insertTasks(client,mission){
 for(const task of mission.tasks){
  await client.query(
   `INSERT INTO baye_mission_tasks
    (mission_id,owner_id,task_id,task_order,status,dependencies,attempt,updated_at,record_json)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)`,
   [mission.id,ownerId(mission),task.id,task.order,task.status,JSON.stringify(task.dependencies),task.attempt,task.updatedAt,JSON.stringify(task)]
  );
 }
}

export class PostgresMissionStore {
 constructor({pool}={}){
  if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw new TypeError('A PostgreSQL pool is required.');
  this.pool=pool;
 }
 // Schema changes are deliberately explicit; init does not run migrations.
 async init(){return this;}
 async create(mission){
  validateMission(mission);
  const client=await this.pool.connect();let began=false;
  try{
   await client.query('BEGIN');began=true;
   await client.query(
    `INSERT INTO baye_missions
     (mission_id,owner_id,schema_version,status,goal,constraints_json,checkpoint_json,retry_json,approvals_json,audit_json,heartbeat_at,created_at,updated_at,record_json,version)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14::jsonb,1)`,
    [mission.id,ownerId(mission),mission.schemaVersion,mission.status,mission.goal,JSON.stringify(mission.constraints),JSON.stringify(mission.checkpoint),JSON.stringify(mission.retry),JSON.stringify(mission.approvals),JSON.stringify(mission.audit),mission.lastHeartbeatAt,mission.createdAt,mission.updatedAt,JSON.stringify(mission)]
   );
   await insertTasks(client,mission);
   await client.query('COMMIT');began=false;
   return clone(mission);
  }catch(error){
   if(began)await client.query('ROLLBACK').catch(()=>{});
   if(error.code==='23505')throw new Error('Mission already exists.');
   throw error;
  }finally{client.release();}
 }
 async get(id){
  const result=await this.pool.query('SELECT record_json FROM baye_missions WHERE mission_id=$1',[id]);
  if(!result.rows[0])return null;
  const mission=result.rows[0].record_json;validateMission(mission);return clone(mission);
 }
 async list(){
  const result=await this.pool.query('SELECT record_json FROM baye_missions ORDER BY created_at,mission_id');
  const missions=result.rows.map(row=>row.record_json);for(const mission of missions)validateMission(mission);return clone(missions);
 }
 async save(mission,{expectedUpdatedAt}={}){
  validateMission(mission);
  const client=await this.pool.connect();let began=false;
  try{
   await client.query('BEGIN');began=true;
   const current=await client.query('SELECT version,owner_id,record_json FROM baye_missions WHERE mission_id=$1 FOR UPDATE',[mission.id]);
   if(!current.rows[0])throw new Error('Mission does not exist.');
   if(current.rows[0].owner_id!==ownerId(mission))throw new Error('Mission owner is immutable.');
   if(expectedUpdatedAt!==undefined&&current.rows[0].record_json.updatedAt!==expectedUpdatedAt)throw new Error('Mission update conflict: stale expectedUpdatedAt.');
   const result=await client.query(
    `UPDATE baye_missions SET schema_version=$2,status=$3,goal=$4,constraints_json=$5::jsonb,checkpoint_json=$6::jsonb,retry_json=$7::jsonb,approvals_json=$8::jsonb,audit_json=$9::jsonb,heartbeat_at=$10,updated_at=$11,record_json=$12::jsonb,version=version+1 WHERE mission_id=$1`,
    [mission.id,mission.schemaVersion,mission.status,mission.goal,JSON.stringify(mission.constraints),JSON.stringify(mission.checkpoint),JSON.stringify(mission.retry),JSON.stringify(mission.approvals),JSON.stringify(mission.audit),mission.lastHeartbeatAt,mission.updatedAt,JSON.stringify(mission)]
   );
   if(result.rowCount!==1)throw new Error('Mission save failed.');
   await client.query('DELETE FROM baye_mission_tasks WHERE mission_id=$1',[mission.id]);
   await insertTasks(client,mission);
   await client.query('COMMIT');began=false;
   return clone(mission);
  }catch(error){if(began)await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
}
