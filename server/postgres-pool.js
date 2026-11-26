// BAYE V6 G10 — opt-in PostgreSQL pool configuration and lifecycle.
// This module is intentionally not wired into server/index.js. Filesystem storage remains active.
import pg from 'pg';

const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','::1']);
const DEFAULT_POOL_MAX=5;

function parsePoolMax(value){
 if(value===undefined||value==='')return DEFAULT_POOL_MAX;
 if(!/^[0-9]+$/.test(String(value)))throw new Error('BAYE_PG_POOL_MAX must be an integer between 1 and 20.');
 const parsed=Number(value);
 if(!Number.isSafeInteger(parsed)||parsed<1||parsed>20)throw new Error('BAYE_PG_POOL_MAX must be an integer between 1 and 20.');
 return parsed;
}

export function readPostgresPoolConfig(env=process.env){
 if(env.BAYE_POSTGRES_ENABLED!=='true')return {enabled:false};
 const raw=env.BAYE_DATABASE_URL;
 if(typeof raw!=='string'||!raw.trim())throw new Error('BAYE_DATABASE_URL is required when BAYE_POSTGRES_ENABLED=true.');
 let url;
 try{url=new URL(raw);}catch{throw new Error('BAYE_DATABASE_URL must be a valid PostgreSQL connection URL.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw new Error('BAYE_DATABASE_URL must use the postgres:// or postgresql:// protocol.');
 if(url.searchParams.has('sslmode'))throw new Error('Remove sslmode from BAYE_DATABASE_URL; configure TLS with BAYE_DATABASE_SSL.');
 const sslEnabled=env.BAYE_DATABASE_SSL==='true';
 if(!LOCAL_HOSTS.has(url.hostname)&&!sslEnabled)throw new Error('BAYE_DATABASE_SSL=true is required for non-local PostgreSQL hosts.');
 if(env.BAYE_DATABASE_SSL!==undefined&&!['true','false'].includes(env.BAYE_DATABASE_SSL))throw new Error('BAYE_DATABASE_SSL must be true or false.');
 return {
  enabled:true,
  connectionString:raw,
  max:parsePoolMax(env.BAYE_PG_POOL_MAX),
  connectionTimeoutMillis:10000,
  idleTimeoutMillis:30000,
  maxLifetimeSeconds:1800,
  application_name:'baye-ai-core',
  ...(sslEnabled?{ssl:{rejectUnauthorized:true}}:{})
 };
}

export function createPostgresPool({env=process.env,PoolClass=pg.Pool,onPoolError=()=>{}}={}){
 const config=readPostgresPoolConfig(env);
 if(!config.enabled)return null;
 const pool=new PoolClass(config);
 // Do not log connection strings, credentials, or raw provider error messages.
 pool.on('error',error=>{
  try{onPoolError({code:typeof error?.code==='string'?error.code:'UNKNOWN'});}catch{}
 });
 let closing;
 return {
  pool,
  close(){
   if(!closing)closing=Promise.resolve().then(()=>pool.end());
   return closing;
  }
 };
}
