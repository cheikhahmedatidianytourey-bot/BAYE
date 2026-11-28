import { runProjectBuildTest } from './project-build-test-runner.js';

const MAX_INPUT_FILES=80;
const MAX_INPUT_BYTES=500_000;

export function validateBuildTestRequest(files){
  if(!Array.isArray(files))return {valid:false,error:'files must be an array'};
  if(files.length===0)return {valid:false,error:'Le projet ne contient aucun fichier.'};
  if(files.length>MAX_INPUT_FILES)return {valid:false,error:'Projet trop volumineux en nombre de fichiers.',limit:MAX_INPUT_FILES};
  let total=0;
  for(const f of files){
    if(!f||typeof f.path!=='string'||typeof f.content!=='string')return {valid:false,error:'Chaque fichier doit contenir path et content en texte.'};
    total+=Buffer.byteLength(f.content,'utf8');
    if(total>MAX_INPUT_BYTES)return {valid:false,error:'Projet trop volumineux.',limitBytes:MAX_INPUT_BYTES};
  }
  return {valid:true,totalBytes:total};
}

/** Runs structural preflight and reports sandbox availability without executing code. */
export async function inspectBuildTestRequest(files){
  const request=validateBuildTestRequest(files);
  if(!request.valid)return {passed:false,stage:'request',issues:[{code:'INVALID_REQUEST',message:request.error}],scope:'build_test_api'};
  const result=await runProjectBuildTest(files);
  return {...result,scope:'build_test_api',executionEnabled:false};
}
