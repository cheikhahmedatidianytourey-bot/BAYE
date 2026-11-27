// G27 durable usage storage. Requires DATABASE_URL and the 'pg' package.
// This module never creates accounts from client-supplied identifiers; account provisioning
// is intentionally separate and tokens must be securely issued by a later auth workflow.
import { createHash } from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;
const validTypes = new Set(['text','image','video','agent']);
let pool;
export function getPool(){
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  if(!pool) pool = new Pool({connectionString:process.env.DATABASE_URL, ssl:process.env.PGSSL==='disable'?false:{rejectUnauthorized:process.env.PGSSL_REJECT_UNAUTHORIZED==='true'}});
  return pool;
}
export function hashAccountToken(token){
  if(typeof token!=='string'||token.length<32||token.length>4096) throw new Error('INVALID_ACCOUNT_TOKEN');
  return createHash('sha256').update(token,'utf8').digest('hex');
}
export async function findAccountByToken(token){
  const digest=hashAccountToken(token);
  const {rows}=await getPool().query('SELECT id, plan_id FROM baye_accounts WHERE token_hash=$1 AND disabled_at IS NULL LIMIT 1',[digest]);
  return rows[0]||null;
}
export async function readAccountUsage(accountId, period=new Date().toISOString().slice(0,7)+'-01'){
  if(typeof accountId!=='string'||! /^[0-9a-f-]{36}$/i.test(accountId)) throw new Error('INVALID_ACCOUNT_ID');
  const {rows}=await getPool().query('SELECT usage_type, used FROM baye_usage_ledger WHERE account_id=$1 AND period_month=$2::date',[accountId,period]);
  return Object.fromEntries(rows.map(r=>[r.usage_type,Number(r.used)]));
}
export async function incrementAccountUsage(accountId,type,period=new Date().toISOString().slice(0,7)+'-01'){
  if(typeof accountId!=='string'||! /^[0-9a-f-]{36}$/i.test(accountId)||!validTypes.has(type)) throw new Error('INVALID_USAGE_INPUT');
  const {rows}=await getPool().query(`INSERT INTO baye_usage_ledger(account_id,period_month,usage_type,used)
    VALUES($1,$2::date,$3,1) ON CONFLICT(account_id,period_month,usage_type)
    DO UPDATE SET used=baye_usage_ledger.used+1,updated_at=NOW()
    RETURNING used`,[accountId,period,type]);
  return Number(rows[0].used);
}
export async function closePool(){if(pool){const p=pool;pool=null;await p.end();}}
