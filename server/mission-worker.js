// BAYE V6 Phase C — single-process mission worker runtime.
// Execution handlers are injected: this module does not grant arbitrary tool access.
import {validateMission,transitionMission,transitionTask} from './mission-engine.js';

export class MissionWorker {
  constructor({store,executeTask,maxTaskAttempts=3}={}) {
    if(!store||typeof store.get!=='function'||typeof store.save!=='function'||typeof store.list!=='function') throw new TypeError('Mission store is required.');
    if(typeof executeTask!=='function') throw new TypeError('A task executor must be explicitly supplied.');
    if(!Number.isSafeInteger(maxTaskAttempts)||maxTaskAttempts<1||maxTaskAttempts>10) throw new TypeError('maxTaskAttempts must be between 1 and 10.');
    this.store=store;this.executeTask=executeTask;this.maxTaskAttempts=maxTaskAttempts;this.active=new Set();
  }
  async runOne(missionId) {
    if(this.active.has(missionId))return {status:'busy',missionId};
    this.active.add(missionId);
    try {
      let mission=await this.store.get(missionId);
      if(!mission)return {status:'not_found',missionId};
      validateMission(mission);
      if(['completed','cancelled'].includes(mission.status))return {status:mission.status,missionId};
      if(mission.status==='queued'||mission.status==='paused'||mission.status==='failed')mission=transitionMission(mission,'running',{event:'worker_mission_started'});
      if(mission.status!=='running')return {status:mission.status,missionId};
      const now=new Date().toISOString();
      mission={...mission,lastHeartbeatAt:now,updatedAt:now};
      await this.store.save(mission);
      const completed=new Set(mission.checkpoint.completedTaskIds);
      const task=mission.tasks.filter(t=>t.status==='pending'&&t.dependencies.every(d=>completed.has(d))).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))[0];
      if(!task) {
        if(mission.tasks.every(t=>t.status==='completed')) {
          mission=transitionMission(mission,'completed',{event:'worker_mission_completed'});
          await this.store.save(mission);
          return {status:'completed',missionId};
        }
        return {status:'blocked',missionId};
      }
      mission=transitionTask(mission,task.id,'running');
      await this.store.save(mission);
      try {
        const result=await this.executeTask(structuredClone(task),structuredClone(mission));
        const resultRef=result===undefined||result===null?null:(typeof result==='string'?result:JSON.stringify(result).slice(0,2000));
        mission=transitionTask(mission,task.id,'completed',{resultRef});
        mission={...mission,lastHeartbeatAt:new Date().toISOString()};
        if(mission.tasks.every(t=>t.status==='completed'))mission=transitionMission(mission,'completed',{event:'worker_mission_completed'});
        await this.store.save(mission);
        return {status:mission.status,missionId,taskId:task.id};
      } catch(error) {
        const message=String(error?.message||'Task execution failed').slice(0,1000);
        mission=transitionTask(mission,task.id,'failed',{error:message});
        mission={...mission,retry:{...mission.retry,attempt:mission.retry.attempt+1,lastError:message,nextRetryAt:null},audit:[...mission.audit,{event:'worker_task_failed',taskId:task.id,at:new Date().toISOString()}]};
        if(task.attempt+1<this.maxTaskAttempts)mission=transitionTask(mission,task.id,'pending',{error:message});
        else mission=transitionMission(mission,'failed',{event:'worker_retry_limit_reached'});
        await this.store.save(mission);
        return {status:mission.status,missionId,taskId:task.id,error:message};
      }
    } finally {this.active.delete(missionId);}
  }
  async runAvailable({limit=10}={}) {
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('limit must be between 1 and 100.');
    const missions=await this.store.list();
    const results=[];
    for(const mission of missions) {
      if(results.length>=limit)break;
      if(['queued','running'].includes(mission.status))results.push(await this.runOne(mission.id));
    }
    return results;
  }
}
