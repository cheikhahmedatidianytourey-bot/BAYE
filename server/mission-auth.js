import crypto from 'node:crypto';

const TOKEN_PATTERN=/^[A-Za-z0-9._~-]{32,512}$/;
const USER_ID_PATTERN=/^[A-Za-z0-9_-]{1,128}$/;

export function parseMissionTokenRecords(raw){
  if(typeof raw!=='string'||!raw.trim())return [];
  let records;
  try{records=JSON.parse(raw);}catch{throw new TypeError('BAYE_MISSION_USER_TOKENS must be valid JSON.');}
  if(!Array.isArray(records)||records.length<1||records.length>1000)throw new TypeError('BAYE_MISSION_USER_TOKENS must contain 1-1000 token records.');
  const seen=new Set();
  return records.map(record=>{
    if(!record||typeof record!=='object'||Array.isArray(record))throw new TypeError('Invalid mission token record.');
    const tokenHash=record.tokenHash;
    const userId=record.userId;
    if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash))throw new TypeError('Mission token hashes must be SHA-256 hex strings.');
    if(typeof userId!=='string'||!USER_ID_PATTERN.test(userId))throw new TypeError('Mission user IDs must be 1-128 safe characters.');
    if(seen.has(tokenHash))throw new TypeError('Duplicate mission token hash.');
    seen.add(tokenHash);
    return Object.freeze({tokenHash,userId});
  });
}

export function hashMissionToken(token){
  if(typeof token!=='string'||!TOKEN_PATTERN.test(token))throw new TypeError('Mission token must be 32-512 safe characters.');
  return crypto.createHash('sha256').update(token,'utf8').digest('hex');
}

export function createMissionAuthenticator({tokenRecords=[]}={}){
  if(!Array.isArray(tokenRecords)||tokenRecords.length>1000)throw new TypeError('Mission token records must be an array of at most 1000 entries.');
  const records=tokenRecords.map(record=>{
    if(!record||typeof record.tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(record.tokenHash)||typeof record.userId!=='string'||!USER_ID_PATTERN.test(record.userId))throw new TypeError('Invalid mission token record.');
    return Object.freeze({tokenHash:record.tokenHash,userId:record.userId});
  });
  return function authenticateMissionRequest(req){
    const header=req.get('authorization')||'';
    if(!header.startsWith('Bearer '))return null;
    const token=header.slice(7);
    if(!TOKEN_PATTERN.test(token))return null;
    const digest=crypto.createHash('sha256').update(token,'utf8').digest();
    for(const record of records){
      const expected=Buffer.from(record.tokenHash,'hex');
      if(crypto.timingSafeEqual(digest,expected))return Object.freeze({userId:record.userId});
    }
    return null;
  };
}
