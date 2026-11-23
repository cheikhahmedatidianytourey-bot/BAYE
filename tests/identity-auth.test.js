import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyBayeIdentityToken,optionalBayeIdentity} from '../server/identity-auth.js';

const secret='test-only-secret-with-at-least-thirty-two-bytes';
const issuer='https://identity.example.test';
const audience='baye-api';
function token(claimOverrides={},header={alg:'HS256',typ:'JWT'}){
 const now=1_800_000_000;
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const h=encode(header);
 const p=encode({iss:issuer,aud:audience,sub:'account:user-123456',iat:now,exp:now+600,...claimOverrides});
 const signature=crypto.createHmac('sha256',secret).update(h+'.'+p).digest('base64url');
 return {value:h+'.'+p+'.'+signature,now};
}
test('accepts a correctly signed, scoped and short-lived identity token',()=>{
 const t=token();
 assert.equal(verifyBayeIdentityToken(t.value,{secret,issuer,audience,now:t.now}).subject,'account:user-123456');
});
test('rejects tampering, wrong secret, issuer, audience and subject',()=>{
 const t=token();
 assert.throws(()=>verifyBayeIdentityToken(t.value.slice(0,-1)+'x',{secret,issuer,audience,now:t.now}));
 assert.throws(()=>verifyBayeIdentityToken(t.value,{secret:'wrong-secret-with-at-least-thirty-two-bytes',issuer,audience,now:t.now}));
 for(const claims of [{iss:'other'},{aud:'other'},{sub:'short'}]){
  const bad=token(claims);
  assert.throws(()=>verifyBayeIdentityToken(bad.value,{secret,issuer,audience,now:bad.now}));
 }
});
test('rejects expired, future-issued, overlong and not-yet-active tokens',()=>{
 for(const claims of [
  {iat:1_799_000_000,exp:1_799_000_001},
  {iat:1_800_000_100,exp:1_800_000_200},
  {iat:1_800_000_000,exp:1_800_004_000},
  {nbf:1_800_000_100}
 ]){
  const bad=token(claims);
  assert.throws(()=>verifyBayeIdentityToken(bad.value,{secret,issuer,audience,now:bad.now}));
 }
});
test('rejects algorithm confusion and incomplete server configuration',()=>{
 const t=token({}, {alg:'none',typ:'JWT'});
 assert.throws(()=>verifyBayeIdentityToken(t.value,{secret,issuer,audience,now:t.now}));
 assert.throws(()=>verifyBayeIdentityToken('x',{secret:'short',issuer,audience}));
 assert.throws(()=>verifyBayeIdentityToken('x',{secret,issuer:'',audience}));
});

function responseRecorder(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function withIdentityEnv(values,fn){const keys=['BAYE_IDENTITY_SECRET','BAYE_IDENTITY_ISSUER','BAYE_IDENTITY_AUDIENCE'];const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));for(const key of keys){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];}try{return fn();}finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}}
test('optional identity preserves anonymous requests without credentials',()=>{const req={get:()=>''};const res=responseRecorder();let called=false;optionalBayeIdentity(req,res,()=>{called=true;});assert.equal(called,true);assert.equal(res.statusCode,200);});
test('optional identity never downgrades invalid bearer token to anonymous',()=>{withIdentityEnv({},()=>{const req={get:()=> 'Bearer invalid'};const res=responseRecorder();let called=false;optionalBayeIdentity(req,res,()=>{called=true;});assert.equal(called,false);assert.equal(res.statusCode,503);});});
test('optional identity attaches only a verified subject when configured',()=>{const t=token();withIdentityEnv({BAYE_IDENTITY_SECRET:secret,BAYE_IDENTITY_ISSUER:issuer,BAYE_IDENTITY_AUDIENCE:audience},()=>{const req={get:()=> 'Bearer '+t.value};const res=responseRecorder();let called=false;optionalBayeIdentity(req,res,()=>{called=true;});assert.equal(called,true);assert.equal(req.bayeIdentity.subject,'account:user-123456');});});
