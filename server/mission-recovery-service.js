import {digestMissionGraph} from './mission-checkpoint-session.js';
import {planMissionRecovery} from './mission-recovery.js';

const OWNER=/^[a-f0-9]{64}$/;
const MISSION=/^[-a-zA-Z0-9_]{1,64}$/;

/**
 * Read-only recovery inspection. It never mutates the ledger or invokes workers.
 */
export async function inspectMissionRecovery({ledger,ownerId,missionId,graph}={}) {
 if(!ledger||typeof ledger.load!=='function')throw new TypeError('Journal durable requis.');
 if(typeof ownerId!=='string'||!OWNER.test(ownerId))throw new TypeError('Espace propriétaire invalide.');
 if(typeof missionId!=='string'||!MISSION.test(missionId))throw new TypeError('Identifiant de mission invalide.');
 const graphDigest=digestMissionGraph(graph);
 const checkpoint=await ledger.load({ownerId,missionId,graphDigest});
 if(!checkpoint)return null;
 return planMissionRecovery({checkpoint,graph,missionId,graphDigest});
}
