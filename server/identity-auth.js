import crypto from 'node:crypto';

const SUBJECT_PATTERN=/^[a-zA-Z0-9._:@-]{8,200}$/;
const MAX_TOKEN_LENGTH=8192;
const CLOCK_SKEW_SECONDS=30;
const MAX_TOKEN_LIFETIME_SECONDS=3600;

function unauthorized(res){return res.status(401).json({error:'Authentification BAYE invalide ou expirée.'});}
function decodeSegment(segment){
 if(typeof segment!=='string'||!segment||!/^[A-Za-z0-9_-]+$/.test(segment))throw new Error('Invalid token segment');
 const decoded=Buffer.from(segment,'base64url');
 if(decoded.toString('base64url')!==segment)throw new Error('Non-canonical token segment');
 return decoded;
}
function safeEqual(a,b){
 const left=Buffer.from(a);const right=Buffer.from(b);
 return left.length===right.length&&crypto.timingSafeEqual(left,right);
}
export function verifyBayeIdentityToken(token,{secret,issuer,audience,now=Math.floor(Date.now()/1000)}={}){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw new Error('BAYE identity secret is not configured securely.');
 if(typeof issuer!=='string'||!issuer.trim()||typeof audience!=='string'||!audience.trim())throw new Error('BAYE identity issuer and audience must be configured.');
 if(typeof token!=='string'||token.length>MAX_TOKEN_LENGTH)throw new Error('Invalid bearer token.');
 const parts=token.split('.');
 if(parts.length!==3)throw new Error('Invalid token structure.');
 const [encodedHeader,encodedPayload,encodedSignature]=parts;
 const header=JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
 const claims=JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
 if(!header||header.alg!=='HS256'||header.typ!=='JWT'||Object.keys(header).some(key=>!['alg','typ'].includes(key)))throw new Error('Unsupported token header.');
 const expected=crypto.createHmac('sha256',secret).update(encodedHeader+'.'+encodedPayload).digest('base64url');
 if(!safeEqual(expected,encodedSignature))throw new Error('Invalid token signature.');
 if(!claims||claims.iss!==issuer||claims.aud!==audience||typeof claims.sub!=='string'||!SUBJECT_PATTERN.test(claims.sub))throw new Error('Invalid identity claims.');
 if(!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.exp<=now-CLOCK_SKEW_SECONDS||claims.iat>now+CLOCK_SKEW_SECONDS||claims.exp<=claims.iat||claims.exp-claims.iat>MAX_TOKEN_LIFETIME_SECONDS)throw new Error('Expired or invalid token lifetime.');
 if(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+CLOCK_SKEW_SECONDS))throw new Error('Token is not active.');
 return Object.freeze({subject:claims.sub,issuer:claims.iss,audience:claims.aud,issuedAt:claims.iat,expiresAt:claims.exp});
}
export function requireBayeIdentity(req,res,next){
 const secret=process.env.BAYE_IDENTITY_SECRET;
 const issuer=process.env.BAYE_IDENTITY_ISSUER;
 const audience=process.env.BAYE_IDENTITY_AUDIENCE;
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||!issuer||!audience)return res.status(503).json({error:'Authentification utilisateur non configurée. Accès mémoire indisponible.'});
 const authorization=req.get('authorization')||'';
 if(!authorization.startsWith('Bearer ')||authorization.length<=7)return unauthorized(res);
 try{req.bayeIdentity=verifyBayeIdentityToken(authorization.slice(7),{secret,issuer,audience});next();}
 catch(_error){return unauthorized(res);}
}

 
// Optional identity for backward-compatible anonymous orchestration.
// If a caller presents a bearer token, it must validate; invalid credentials never downgrade to anonymous.
export function optionalBayeIdentity(req,res,next){
 const authorization=req.get('authorization')||'';
 if(!authorization)return next();
 const secret=process.env.BAYE_IDENTITY_SECRET;
 const issuer=process.env.BAYE_IDENTITY_ISSUER;
 const audience=process.env.BAYE_IDENTITY_AUDIENCE;
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32||!issuer||!audience)return res.status(503).json({error:'Authentification utilisateur non configurée.'});
 if(!authorization.startsWith('Bearer ')||authorization.length<=7)return unauthorized(res);
 try{req.bayeIdentity=verifyBayeIdentityToken(authorization.slice(7),{secret,issuer,audience});next();}
 catch(_error){return unauthorized(res);}
}
