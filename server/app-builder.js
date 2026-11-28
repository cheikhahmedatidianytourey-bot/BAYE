import { validateProjectFiles } from './project-output-validator.js';

const MAX_PROMPT_LENGTH=4000;
const MAX_RESPONSE_LENGTH=100000;

export function validateAppBuilderPrompt(prompt){
  if(typeof prompt!=='string'||!prompt.trim())return {valid:false,reason:'PROMPT_REQUIRED'};
  if(prompt.length>MAX_PROMPT_LENGTH)return {valid:false,reason:'PROMPT_TOO_LONG',limit:MAX_PROMPT_LENGTH};
  return {valid:true,prompt:prompt.trim()};
}

export function parseGeneratedProject(raw){
  if(typeof raw!=='string'||raw.length>MAX_RESPONSE_LENGTH)return {passed:false,issues:[{code:'OUTPUT_INVALID_OR_TOO_LARGE'}]};
  let parsed;
  try{parsed=JSON.parse(raw);}catch{return {passed:false,issues:[{code:'JSON_PARSE_FAILED'}]};}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Array.isArray(parsed.files))return {passed:false,issues:[{code:'FILES_ARRAY_REQUIRED'}]};
  const structural=validateProjectFiles(parsed.files,{maxFiles:80,maxTotalBytes:500_000});
  if(!structural.passed)return {passed:false,issues:structural.issues,structural};
  const files=parsed.files.map(({path,content})=>({path,content}));
  const summary=typeof parsed.summary==='string'?parsed.summary.slice(0,2000):'Projet généré';
  return {passed:true,files,summary,structural,scope:'manifest_generation_and_structure_validation_only',execution:false,buildVerified:false};
}

export function buildAppBuilderInstruction(){
  return 'Generate a small, coherent starter web application. Return ONLY valid JSON with keys summary and files. files is an array of objects with path and content string. Prefer a simple Vite React app: package.json, index.html, src/main.jsx, src/App.jsx, src/styles.css. package.json must contain a build script using vite. Do not include lockfiles, binary files, secrets, .env files, absolute paths, parent-directory paths, or deployment instructions that execute automatically. Use plain CSS and accessible responsive UI. No code is executed or dependencies installed by this generator. Keep the output under 80 files and 500 KB.';
}
