const OWNER=/^[a-f0-9]{64}$/;
const IDENTIFIER=/^[-a-zA-Z0-9_]{1,64}$/;
const WORKER=/^[-a-zA-Z0-9_.:]{1,128}$/;
const IDEMPOTENCY=/^[a-zA-Z0-9_.:-]{8,200}$/;
const MIN_LEASE_MS=1_000;
const MAX_LEASE_MS=300_000;

export const MISSION_COORDINATION_SCHEMA_SQL=`
CREATE TABLE IF NOT EXISTS baye_mission_task_claims (
  owner_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  claim_owner TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  fencing_token BIGINT NOT NULL CHECK (fencing_token > 0),
  status TEXT NOT NULL CHECK (status IN ('claimed','completed','needs_review','retryable','released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, mission_id, task_id)
);
CREATE INDEX IF NOT EXISTS baye_mission_task_claims_lease_idx
  ON baye_mission_task_claims (status, lease_expires_at);
CREATE TABLE IF NOT EXISTS baye_mission_task_recovery_evidence (
  owner_id TEXT NOT NULL, mission_id TEXT NOT NULL, task_id TEXT NOT NULL,
  replay_safe BOOLEAN NOT NULL, checkpoint_valid BOOLEAN NOT NULL,
  side_effects_uncertain BOOLEAN NOT NULL,
  recovery_attempts INTEGER NOT NULL CHECK (recovery_attempts >= 0),
  max_recovery_attempts INTEGER NOT NULL CHECK (max_recovery_attempts BETWEEN 1 AND 100),
  evidence_revision BIGINT NOT NULL CHECK (evidence_revision > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, mission_id, task_id)
);
`;

function requireString(value,pattern,message){
 if(typeof value!=='string'||!pattern.test(value))throw new TypeError(message);
 return value;
}
function requireLease(value){
 if(!Number.isSafeInteger(value)||value<MIN_LEASE_MS||value>MAX_LEASE_MS)throw new TypeError('Lease duration must be between 1000 and 300000 ms.');
 return value;
}
function scope(input={}){
 return {
  ownerId:requireString(input.ownerId,OWNER,'Hashed owner namespace is required.'),
  missionId:requireString(input.missionId,IDENTIFIER,'Mission identifier is invalid.'),
  taskId:requireString(input.taskId,IDENTIFIER,'Task identifier is invalid.')
 };
}
function claimRow(row){
 return row?{
  ownerId:row.owner_id,missionId:row.mission_id,taskId:row.task_id,
  claimOwner:row.claim_owner,idempotencyKey:row.idempotency_key,
  fencingToken:String(row.fencing_token),leaseExpiresAt:row.lease_expires_at
 }:null;
}
function requireFencingToken(value){
 return requireString(String(value??''),/^[1-9][0-9]{0,18}$/,'Fencing token is invalid.');
}

/**
 * PostgreSQL-backed cross-process claim/lease store.
 * Initial claims use one conditional upsert. Recovery uses a separate
 * snapshot-bound compare-and-swap so an inspected generation cannot be
 * silently replaced after another worker has reclaimed it.
 */
export function createPostgresMissionCoordinationStore({pool}={}){
 if(!pool||typeof pool.query!=='function')throw new TypeError('A PostgreSQL-compatible pool is required.');
 return Object.freeze({
  async ensureSchema(){
   await pool.query(MISSION_COORDINATION_SCHEMA_SQL);
   return {ready:true};
  },
  async claim(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const claimOwner=requireString(input.claimOwner,WORKER,'Claim owner is invalid.');
   const idempotencyKey=requireString(input.idempotencyKey,IDEMPOTENCY,'Stable idempotency key is required.');
   const leaseMs=requireLease(input.leaseMs);
   const result=await pool.query(`
     INSERT INTO baye_mission_task_claims
       (owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,fencing_token,status)
     VALUES ($1,$2,$3,$4,$5,NOW()+($6 * INTERVAL '1 millisecond'),1,'claimed')
     ON CONFLICT (owner_id,mission_id,task_id) DO UPDATE
       SET claim_owner=EXCLUDED.claim_owner,
           lease_expires_at=EXCLUDED.lease_expires_at,
           fencing_token=baye_mission_task_claims.fencing_token+1,
           status='claimed',
           updated_at=NOW()
       WHERE baye_mission_task_claims.idempotency_key=EXCLUDED.idempotency_key
         AND baye_mission_task_claims.status IN ('claimed','retryable','released')
         AND (baye_mission_task_claims.lease_expires_at<=NOW()
              OR baye_mission_task_claims.status IN ('retryable','released'))
     RETURNING owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,fencing_token
   `,[ownerId,missionId,taskId,claimOwner,idempotencyKey,leaseMs]);
   return claimRow(result.rows?.[0]??null);
  },
  async inspect(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const result=await pool.query(`
     SELECT owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,
            fencing_token,status,(lease_expires_at<=NOW()) AS lease_expired
       FROM baye_mission_task_claims
       WHERE owner_id=$1 AND mission_id=$2 AND task_id=$3
   `,[ownerId,missionId,taskId]);
   const row=result.rows?.[0];
   return row?{...claimRow(row),status:row.status,leaseExpired:row.lease_expired===true}:null;
  },
  async inspectRecoveryEvidence(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const result=await pool.query("SELECT replay_safe,checkpoint_valid,side_effects_uncertain,recovery_attempts,max_recovery_attempts,evidence_revision FROM baye_mission_task_recovery_evidence WHERE owner_id=$1 AND mission_id=$2 AND task_id=$3",[ownerId,missionId,taskId]);
   const row=result.rows?.[0];
   return row?{replaySafe:row.replay_safe,checkpointValid:row.checkpoint_valid,sideEffectsUncertain:row.side_effects_uncertain,recoveryAttempts:Number(row.recovery_attempts),maxRecoveryAttempts:Number(row.max_recovery_attempts),evidenceRevision:String(row.evidence_revision)}:null;
  },
  async reclaim(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const claimOwner=requireString(input.claimOwner,WORKER,'Claim owner is invalid.');
   const idempotencyKey=requireString(input.idempotencyKey,IDEMPOTENCY,'Stable idempotency key is required.');
   const fencingToken=requireFencingToken(input.fencingToken);
   const leaseMs=requireLease(input.leaseMs);
   const result=await pool.query(`
     UPDATE baye_mission_task_claims
       SET claim_owner=$4,
           lease_expires_at=NOW()+($7 * INTERVAL '1 millisecond'),
           fencing_token=fencing_token+1,
           status='claimed',
           updated_at=NOW()
       WHERE owner_id=$1 AND mission_id=$2 AND task_id=$3
         AND idempotency_key=$5
         AND fencing_token=$6::BIGINT
         AND status IN ('claimed','retryable','released')
         AND lease_expires_at<=NOW()
     RETURNING owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,fencing_token
   `,[ownerId,missionId,taskId,claimOwner,idempotencyKey,fencingToken,leaseMs]);
   return claimRow(result.rows?.[0]??null);
  },
  async renew(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const claimOwner=requireString(input.claimOwner,WORKER,'Claim owner is invalid.');
   const fencingToken=requireFencingToken(input.fencingToken);
   const leaseMs=requireLease(input.leaseMs);
   const result=await pool.query(`
     UPDATE baye_mission_task_claims
       SET lease_expires_at=NOW()+($6 * INTERVAL '1 millisecond'),updated_at=NOW()
       WHERE owner_id=$1 AND mission_id=$2 AND task_id=$3
         AND claim_owner=$4 AND fencing_token=$5::BIGINT
         AND status='claimed' AND lease_expires_at>NOW()
       RETURNING owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,fencing_token
   `,[ownerId,missionId,taskId,claimOwner,fencingToken,leaseMs]);
   return claimRow(result.rows?.[0]??null);
  },
  async settle(input={}){
   const {ownerId,missionId,taskId}=scope(input);
   const claimOwner=requireString(input.claimOwner,WORKER,'Claim owner is invalid.');
   const fencingToken=requireFencingToken(input.fencingToken);
   const status=input.status;
   if(!['completed','needs_review','retryable','released'].includes(status))throw new TypeError('Invalid terminal claim status.');
   const result=await pool.query(`
     UPDATE baye_mission_task_claims
       SET status=$6,lease_expires_at=NOW(),updated_at=NOW()
       WHERE owner_id=$1 AND mission_id=$2 AND task_id=$3
         AND claim_owner=$4 AND fencing_token=$5::BIGINT
         AND status='claimed' AND lease_expires_at>NOW()
       RETURNING owner_id,mission_id,task_id,claim_owner,idempotency_key,lease_expires_at,fencing_token,status
   `,[ownerId,missionId,taskId,claimOwner,fencingToken,status]);
   const row=result.rows?.[0];
   return row?{...claimRow(row),status:row.status}:null;
  }
 });
}
