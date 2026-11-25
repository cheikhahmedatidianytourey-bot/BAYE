// Tenant-scoped PostgreSQL mission repository. Additive G1 implementation; not yet wired into server runtime.
import {validateMission} from '../mission-engine.js';

export class MissionRepository {
  constructor({pool}={}) {
    if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function') throw new TypeError('A PostgreSQL pool is required.');
    this.pool=pool;
  }
  _owner(ownerId){if(typeof ownerId!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(ownerId))throw new TypeError('Valid owner ID required.');return ownerId;}
  _mission(mission,ownerId){validateMission(mission);if(mission.ownerRef!==ownerId)throw new Error('Mission owner mismatch.');}
  async create(ownerId,mission){
    ownerId=this._owner(ownerId);this._mission(mission,ownerId);
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('INSERT INTO baye_missions (mission_id,owner_id,schema_version,status,goal,constraints_json,checkpoint_json,retry_json,approvals_json,audit_json,heartbeat_at,created_at,updated_at,record_json,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1)',[mission.id,ownerId,mission.schemaVersion,mission.status,mission.goal,mission.constraints,mission.checkpoint,mission.retry,mission.approvals,mission.audit,mission.lastHeartbeatAt,mission.createdAt,mission.updatedAt,mission]);
      await this._replaceTasks(client,ownerId,mission);
      await client.query('COMMIT');return structuredClone(mission);
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async get(ownerId,missionId){
    ownerId=this._owner(ownerId);
    const result=await this.pool.query('SELECT record_json,version FROM baye_missions WHERE owner_id=$1 AND mission_id=$2',[ownerId,missionId]);
    if(!result.rows.length)return null;const mission=result.rows[0].record_json;validateMission(mission);return {mission:structuredClone(mission),version:Number(result.rows[0].version)};
  }
  async list(ownerId,{limit=100,offset=0}={}){
    ownerId=this._owner(ownerId);if(!Number.isSafeInteger(limit)||limit<1||limit>500||!Number.isSafeInteger(offset)||offset<0)throw new TypeError('Invalid list pagination.');
    const result=await this.pool.query('SELECT record_json FROM baye_missions WHERE owner_id=$1 ORDER BY created_at,mission_id LIMIT $2 OFFSET $3',[ownerId,limit,offset]);
    const records=result.rows.map(r=>r.record_json);records.forEach(validateMission);return structuredClone(records);
  }
  async save(ownerId,mission,expectedVersion){
    ownerId=this._owner(ownerId);this._mission(mission,ownerId);
    if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)throw new TypeError('Expected repository version required.');
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      const result=await client.query('UPDATE baye_missions SET schema_version=$3,status=$4,goal=$5,constraints_json=$6,checkpoint_json=$7,retry_json=$8,approvals_json=$9,audit_json=$10,heartbeat_at=$11,updated_at=$12,record_json=$13,version=version+1 WHERE owner_id=$1 AND mission_id=$2 AND version=$14 RETURNING version',[ownerId,mission.id,mission.schemaVersion,mission.status,mission.goal,mission.constraints,mission.checkpoint,mission.retry,mission.approvals,mission.audit,mission.lastHeartbeatAt,mission.updatedAt,mission,expectedVersion]);
      if(!result.rows.length){const exists=await client.query('SELECT 1 FROM baye_missions WHERE owner_id=$1 AND mission_id=$2',[ownerId,mission.id]);if(!exists.rows.length)throw new Error('Mission not found.');throw new Error('Mission version conflict.');}
      await this._replaceTasks(client,ownerId,mission);
      await client.query('COMMIT');return {mission:structuredClone(mission),version:Number(result.rows[0].version)};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async _replaceTasks(client,ownerId,mission){
    await client.query('DELETE FROM baye_mission_tasks WHERE owner_id=$1 AND mission_id=$2',[ownerId,mission.id]);
    for(const task of mission.tasks)await client.query('INSERT INTO baye_mission_tasks (mission_id,owner_id,task_id,task_order,status,dependencies,attempt,updated_at,record_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[mission.id,ownerId,task.id,task.order,task.status,task.dependencies,task.attempt,task.updatedAt,task]);
  }
}
