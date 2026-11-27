import pg from 'pg';
import crypto from 'node:crypto';

const pool = process.env.DATABASE_URL ? new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:false},max:5}) : null;
const types=new Set(['text','image','video','agent']);
export function dbReady(){return Boolean(pool);}
export async function initializeAccountQuotaDb(){
 if(!pool)throw new Error('DATABASE_URL is required');
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_sessions (token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES baye_accounts(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 await pool.query(`CREATE TABLE IF NOT EXISTS baye_quota_usage (account_id UUID NOT NULL REFERENCES baye_accounts(id) ON DELETE CASCADE, period TEXT NOT NULL, usage_type TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0), PRIMARY KEY(account_id,period,usage_type));`);
}
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');
function hashPassword(password){const salt=crypto.randomBytes(16);const derived=crypto.scryptSync(password,salt,64);return salt.toString('hex')+':'+derived.toString('hex');}
function verifyPassword(password,stored){try{const [s,d]=stored.split(':');const salt=Buffer.from(s,'hex'),expected=Buffer.from(d,'hex'),actual=crypto.scryptSync(password,salt,64);return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);}catch{return false;}}
export async function createAccount(email,password){
 if(!pool)throw new Error('DATABASE_URL unavailable');
 const e=typeof email==='string'?email.trim().toLowerCase():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)||e.length>254)throw Object.assign(new Error('Email invalide.'),{status:400});
 if(typeof password!=='string'||password.length<12||password.length>200)throw Object.assign(new Error('Mot de passe : 12 caractères minimum.'),{status:400});
 const passwordHash=hashPassword(password);
 try{const r=await pool.query('INSERT INTO baye_accounts(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at',[e,passwordHash]);return r.rows[0];}
 catch(err){if(err.code==='23505')throw Object.assign(new Error('Compte déjà existant.'),{status:409});throw err;}
}
export async function loginAccount(email,password){
 if(!pool)throw new Error('DATABASE_URL unavailable');
 const e=typeof email==='string'?email.trim().toLowerCase():'';
 const r=await pool.query('SELECT id,email,password_hash FROM baye_accounts WHERE email=$1',[e]);
 if(!r.rows.length||!verifyPassword(password||'',r.rows[0].password_hash))throw Object.assign(new Error('Identifiants incorrects.'),{status:401});
 const token=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+30*86400000);
 await pool.query('INSERT INTO baye_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)',[hashToken(token),r.rows[0].id,expires]);
 return {token,account:{id:r.rows[0].id,email:r.rows[0].email},expiresAt:expires.toISOString()};
}
export async function authenticateAccount(req,res,next){
 try{const token=(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token||token.length>200)return res.status(401).json({error:'Connexion requise.'});
 const r=await pool.query('SELECT a.id,a.email FROM baye_sessions s JOIN baye_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[hashToken(token)]);
 if(!r.rows.length)return res.status(401).json({error:'Session invalide ou expirée.'});req.account=r.rows[0];next();}
 catch(_){res.status(503).json({error:'Authentification momentanément indisponible.'});}
}
export async function consumeAccountQuota(accountId,type,limits){
 if(!pool||!types.has(type))return {allowed:false,reason:'unavailable'};
 const limit=limits[type];if(!Number.isSafeInteger(limit)||limit<0)return {allowed:false,reason:'invalid_policy'};
 const period=new Date().toISOString().slice(0,7);
 const r=await pool.query(`INSERT INTO baye_quota_usage(account_id,period,usage_type,used) SELECT $1,$2,$3,1 WHERE $4>0 ON CONFLICT(account_id,period,usage_type) DO UPDATE SET used=baye_quota_usage.used+1 WHERE baye_quota_usage.used<$4 RETURNING used`,[accountId,period,type,limit]);
 if(!r.rows.length){const c=await pool.query('SELECT used FROM baye_quota_usage WHERE account_id=$1 AND period=$2 AND usage_type=$3',[accountId,period,type]);return {allowed:false,reason:limit===0?'feature_not_included':'quota_exceeded',limit,used:c.rows[0]?.used||0,remaining:0,period};}
 return {allowed:true,limit,used:r.rows[0].used,remaining:limit-r.rows[0].used,period};
}
export async function accountQuotaUsage(accountId,limits){
 const period=new Date().toISOString().slice(0,7),r=await pool.query('SELECT usage_type,used FROM baye_quota_usage WHERE account_id=$1 AND period=$2',[accountId,period]);const usage={};
 for(const t of types){const used=r.rows.find(x=>x.usage_type===t)?.used||0;usage[t]={used,limit:limits[t],remaining:Math.max(0,limits[t]-used)};}
 return {period,plan:'free',usage};
}
export async function revokeSession(req){const token=(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(token)await pool.query('DELETE FROM baye_sessions WHERE token_hash=$1',[hashToken(token)]);}
