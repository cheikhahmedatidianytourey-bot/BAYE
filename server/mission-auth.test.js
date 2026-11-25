import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMissionAuthenticator,hashMissionToken,parseMissionTokenRecords} from './mission-auth.js';

const TOKEN_A='mission-user-a-token-with-more-than-thirty-two-characters';
const TOKEN_B='mission-user-b-token-with-more-than-thirty-two-characters';

test('mission token hashes are deterministic SHA-256 digests',()=>{
  const digest=hashMissionToken(TOKEN_A);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(hashMissionToken(TOKEN_A),digest);
  assert.notEqual(hashMissionToken(TOKEN_A),hashMissionToken(TOKEN_B));
});

test('mission authenticator maps distinct bearer tokens to distinct stable user IDs',()=>{
  const authenticate=createMissionAuthenticator({tokenRecords:[
    {tokenHash:hashMissionToken(TOKEN_A),userId:'account-a'},
    {tokenHash:hashMissionToken(TOKEN_B),userId:'account-b'}
  ]});
  const request=token=>({get:name=>name==='authorization'?'Bearer '+token:''});
  assert.equal(authenticate(request(TOKEN_A)).userId,'account-a');
  assert.equal(authenticate(request(TOKEN_B)).userId,'account-b');
  assert.equal(authenticate(request('unknown-token-that-is-long-enough-000')),null);
  assert.equal(authenticate({get:()=>''}),null);
});

test('mission token configuration rejects malformed JSON, weak hashes and duplicate hashes',()=>{
  assert.deepEqual(parseMissionTokenRecords(''),[]);
  assert.throws(()=>parseMissionTokenRecords('{bad json'),/valid JSON/);
  assert.throws(()=>parseMissionTokenRecords('[]'),/1-1000/);
  assert.throws(()=>parseMissionTokenRecords(JSON.stringify([{tokenHash:'short',userId:'user-a'}])),/SHA-256/);
  const hash=hashMissionToken(TOKEN_A);
  assert.throws(()=>parseMissionTokenRecords(JSON.stringify([
    {tokenHash:hash,userId:'user-a'},
    {tokenHash:hash,userId:'user-b'}
  ])),/Duplicate/);
});

test('mission token configuration rejects unsafe user identifiers',()=>{
  const tokenHash=hashMissionToken(TOKEN_A);
  assert.throws(()=>parseMissionTokenRecords(JSON.stringify([{tokenHash,userId:'../other'}])),/safe characters/);
});
