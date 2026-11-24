import crypto from 'node:crypto';
import { digestMissionGraph } from './mission-checkpoint-session.js';

const TOKEN_VERSION=1;
const BASE_SCOPES=Object.freeze(['specialist:text_inference','mission:checkpoint_write','mission:memory_write']);
const NONCE_KEY_ID='mission-execution-approval-v1';
const MAX_TOKEN_LENGTH=8192;
const DEFAULT_TTL_SECONDS=300;
const fail=(message,code='EXECUTION_APPROVAL_INVALID')=>{const error=new Error(message);error.code=code;throw error;};

function decodeSegment(segment){
 if(typeof segment!=='string'||!segment||!/^[A-Za-z0-9_-]+$/.test(segment))fail('Jeton d’approbation invalide.');
 const decoded=Buffer.from(segment,'base64url');
 if(decoded.toString('base64url')!==segment)fail('Encodage du jeton d’approbation invalide.');
 return decoded;
}
function safeEqual(left,right){
 const a=Buffer.from(left),b=Buffer.from(right);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function validateSecret(secret){
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)fail('La clé d’approbation BAYE doit contenir au moins 32 octets.','EXECUTION_APPROVAL_NOT_CONFIGURED');
 return secret;
}
function scopesForReview(reviewMode){
 if(!['deterministic','semantic'].includes(reviewMode))fail('Mode de vérification invalide.');
 return reviewMode==='semantic'?[...BASE_SCOPES,'specialist:semantic_review']:[...BASE_SCOPES];
}
function validateBinding({ownerId,missionId,graph,reviewMode='deterministic'}={}){
 if(typeof ownerId!=='string'||!/^[a-zA-Z0-9._:@-]{8,200}$/.test(ownerId))fail('Identité propriétaire invalide.');
 if(typeof missionId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(missionId))fail('Identifiant de mission invalide.');
 if(!graph||graph.status!=='validated'||graph.mode!=='plan_only'||!Array.isArray(graph.tasks)||graph.tasks.length<1||graph.tasks.length>5)fail('Un graphe de mission validé est requis.');
 const taskIds=graph.tasks.map(task=>task?.id);
 if(taskIds.some(id=>typeof id!=='string')||new Set(taskIds).size!==taskIds.length)fail('Le périmètre des tâches est invalide.');
 return {taskIds,graphDigest:digestMissionGraph(graph),reviewMode,scopes:scopesForReview(reviewMode)};
}
function encode(value){return Buffer.from(JSON.stringify(value)).toString('base64url');}

/** Creates a short-lived approval bound to the owner, mission, exact graph and review mode. */
export function issueExecutionApproval({approved,ownerId,missionId,graph,reviewMode='deterministic',secret,now=Math.floor(Date.now()/1000),ttlSeconds=DEFAULT_TTL_SECONDS}={}){
 validateSecret(secret);
 if(approved!==true)fail('Une approbation explicite est obligatoire.');
 if(!Number.isSafeInteger(now)||now<1||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>600)fail('Durée d’approbation invalide.');
 const binding=validateBinding({ownerId,missionId,graph,reviewMode});
 const claims={
  v:TOKEN_VERSION,sub:ownerId,missionId,graphDigest:binding.graphDigest,
  taskIds:binding.taskIds,reviewMode:binding.reviewMode,scopes:binding.scopes,
  iat:now,exp:now+ttlSeconds,nonce:crypto.randomBytes(24).toString('base64url')
 };
 const header=encode({alg:'HS256',typ:'BAYE-APPROVAL'});
 const payload=encode(claims);
 const signingInput=header+'.'+payload;
 const signature=crypto.createHmac('sha256',secret).update(signingInput,'utf8').digest('base64url');
 return Object.freeze({
  token:signingInput+'.'+signature,
  approval:{status:'approved',missionId,taskCount:binding.taskIds.length,reviewMode:binding.reviewMode,scopes:binding.scopes,issuedAt:now,expiresAt:claims.exp,oneTimeUse:true,externalActions:false}
 });
}

/** Verifies the approval and atomically consumes its nonce before execution. */
export async function verifyAndConsumeExecutionApproval({token,ownerId,missionId,graph,reviewMode='deterministic',secret,nonceStore,now=Math.floor(Date.now()/1000)}={}){
 validateSecret(secret);
 if(!nonceStore||typeof nonceStore.consume!=='function')fail('Le stockage anti-rejeu des approbations est indisponible.','EXECUTION_APPROVAL_NOT_CONFIGURED');
 if(typeof token!=='string'||token.length>MAX_TOKEN_LENGTH)fail('Jeton d’approbation manquant ou trop volumineux.');
 const parts=token.split('.');
 if(parts.length!==3)fail('Structure du jeton d’approbation invalide.');
 const [encodedHeader,encodedPayload,signature]=parts;
 let header,claims;
 try{
  header=JSON.parse(decodeSegment(encodedHeader).toString('utf8'));
  claims=JSON.parse(decodeSegment(encodedPayload).toString('utf8'));
 }catch(error){
  if(error?.code==='EXECUTION_APPROVAL_INVALID')throw error;
  fail('Contenu JSON du jeton d’approbation invalide.');
 }
 if(!header||header.alg!=='HS256'||header.typ!=='BAYE-APPROVAL'||Object.keys(header).length!==2)fail('En-tête du jeton d’approbation invalide.');
 const expected=crypto.createHmac('sha256',secret).update(encodedHeader+'.'+encodedPayload,'utf8').digest('base64url');
 if(!safeEqual(expected,signature))fail('Signature d’approbation invalide.');
 const binding=validateBinding({ownerId,missionId,graph,reviewMode});
 const keys=['v','sub','missionId','graphDigest','taskIds','reviewMode','scopes','iat','exp','nonce'];
 if(!claims||typeof claims!=='object'||Array.isArray(claims)||Object.keys(claims).length!==keys.length||keys.some(key=>!Object.hasOwn(claims,key)))fail('Contenu du jeton d’approbation invalide.');
 if(claims.v!==TOKEN_VERSION||claims.sub!==ownerId||claims.missionId!==missionId||claims.graphDigest!==binding.graphDigest||
    !Array.isArray(claims.taskIds)||JSON.stringify(claims.taskIds)!==JSON.stringify(binding.taskIds)||
    claims.reviewMode!==binding.reviewMode||!Array.isArray(claims.scopes)||JSON.stringify(claims.scopes)!==JSON.stringify(binding.scopes))fail('L’approbation ne correspond pas à cette identité, cette mission, ces tâches ou ce mode de vérification.');
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
    claims.exp<=now||claims.iat>now+30||claims.exp<=claims.iat||claims.exp-claims.iat>600||
    typeof claims.nonce!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(claims.nonce))fail('Approbation expirée ou invalide.');
 let consumed;
 try{
  consumed=await nonceStore.consume({keyId:NONCE_KEY_ID,nonce:claims.nonce,expiresAt:claims.exp*1000});
 }catch(_error){fail('Impossible de vérifier l’unicité de l’approbation. Exécution refusée.','EXECUTION_APPROVAL_STORE_FAILED');}
 if(consumed!==true)fail('Cette approbation a déjà été utilisée ou n’est plus disponible.','EXECUTION_APPROVAL_REPLAY');
 return Object.freeze({authorized:true,ownerId,missionId,taskIds:[...claims.taskIds],reviewMode:binding.reviewMode,scopes:[...claims.scopes],graphDigest:binding.graphDigest,expiresAt:claims.exp,oneTimeUse:true});
}
