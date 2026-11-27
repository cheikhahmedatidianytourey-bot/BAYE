import { validateProjectFiles } from './project-output-validator.js';

const MAX_TIMEOUT_MS=120_000;
const MIN_TIMEOUT_MS=1_000;
const MAX_FILES=200;
const MAX_TOTAL_BYTES=2_000_000;

/**
 * Build-test orchestration boundary. Actual code execution MUST be delegated to
 * an externally isolated sandbox adapter; this module never spawns processes.
 */
export async function runProjectBuildTest(files,{sandbox,timeoutMs=30_000}={}){
  const structural=validateProjectFiles(files,{maxFiles:MAX_FILES,maxTotalBytes:MAX_TOTAL_BYTES});
  if(!structural.passed)return {passed:false,stage:'preflight',structural,issues:structural.issues,scope:'sandbox_build_test'};
  if(!sandbox||typeof sandbox.execute!=='function')return {passed:false,stage:'configuration',issues:[{code:'SANDBOX_ADAPTER_REQUIRED'}],scope:'sandbox_build_test',limitation:'No code is executed in this module. Supply an isolated sandbox adapter.'};
  if(!Number.isInteger(timeoutMs)||timeoutMs<MIN_TIMEOUT_MS||timeoutMs>MAX_TIMEOUT_MS)return {passed:false,stage:'configuration',issues:[{code:'TIMEOUT_OUT_OF_RANGE',min:MIN_TIMEOUT_MS,max:MAX_TIMEOUT_MS}],scope:'sandbox_build_test'};
  const pkgFile=files.find(f=>f.path==='package.json');
  if(!pkgFile)return {passed:false,stage:'preflight',issues:[{code:'PACKAGE_JSON_REQUIRED'}],scope:'sandbox_build_test'};
  let pkg;try{pkg=JSON.parse(pkgFile.content);}catch{return {passed:false,stage:'preflight',issues:[{code:'PACKAGE_JSON_INVALID'}],scope:'sandbox_build_test'};}
  if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))return {passed:false,stage:'preflight',issues:[{code:'PACKAGE_JSON_NOT_OBJECT'}],scope:'sandbox_build_test'};
  if(!pkg.scripts||typeof pkg.scripts.build!=='string'||!pkg.scripts.build.trim())return {passed:false,stage:'preflight',issues:[{code:'BUILD_SCRIPT_MISSING'}],scope:'sandbox_build_test'};
  try{
    const result=await sandbox.execute({files,command:'npm',args:['run','build'],timeoutMs,network:false});
    const passed=!!result&&result.exitCode===0&&!result.timedOut;
    return {passed,stage:'build',exitCode:result?.exitCode??null,timedOut:!!result?.timedOut,stdout:String(result?.stdout??'').slice(-12_000),stderr:String(result?.stderr??'').slice(-12_000),issues:passed?[]:[{code:result?.timedOut?'BUILD_TIMEOUT':'BUILD_FAILED'}],scope:'sandbox_build_test',limitation:'Build outcome depends on the supplied isolated sandbox. Dependencies are not installed here; sandbox must provide them or safely provision them.'};
  }catch(error){return {passed:false,stage:'build',issues:[{code:'SANDBOX_EXECUTION_ERROR',message:String(error?.message??error).slice(0,500)}],scope:'sandbox_build_test'};}
}
