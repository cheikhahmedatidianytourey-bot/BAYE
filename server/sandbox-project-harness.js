import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MAX_FILES=200,MAX_BYTES=2_000_000,MAX_TIMEOUT=15_000;
/**
 * Writes a validated project manifest into a temporary directory and optionally runs a caller-supplied command.
 * No shell, no network isolation guarantee, and no arbitrary command execution is enabled by default.
 * Caller must provide an explicit command allowlist and run this harness inside an external sandbox/container.
 */
export async function prepareProjectSandbox(files,{allowedCommands=[],command=null,args=[],timeoutMs=MAX_TIMEOUT,keepDirectory=false}={}){
 if(!Array.isArray(files)||!files.length||files.length>MAX_FILES)throw new Error('INVALID_MANIFEST');
 let total=0;const seen=new Set();
 for(const f of files){if(!f||typeof f.path!=='string'||typeof f.content!=='string')throw new Error('INVALID_FILE');const p=f.path;if(!p||p.startsWith('/')||p.includes('\\')||p.split('/').some(x=>x==='.'||x==='..'||!x))throw new Error('UNSAFE_PATH');if(seen.has(p))throw new Error('DUPLICATE_PATH');seen.add(p);total+=Buffer.byteLength(f.content);if(total>MAX_BYTES)throw new Error('PROJECT_TOO_LARGE');}
 if(command!==null&&(!allowedCommands.includes(command)||!Array.isArray(args)||args.some(a=>typeof a!=='string')))throw new Error('COMMAND_NOT_ALLOWED');
 const root=await mkdtemp(join(tmpdir(),'baye-project-'));
 try{for(const f of files){const dest=resolve(root,f.path);if(!dest.startsWith(root+'/'))throw new Error('UNSAFE_PATH');await mkdir(join(dest,'..'),{recursive:true});await writeFile(dest,f.content,{encoding:'utf8',flag:'wx'});}
  let execution=null;if(command){execution=await new Promise((done)=>{const child=spawn(command,args,{cwd:root,shell:false,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});let stdout='',stderr='',timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},Math.min(Math.max(timeoutMs,100),MAX_TIMEOUT));child.stdout.on('data',d=>stdout+=d.toString());child.stderr.on('data',d=>stderr+=d.toString());child.on('error',e=>{clearTimeout(timer);done({exitCode:null,error:e.message,stdout,stderr,timedOut});});child.on('close',(code)=>{clearTimeout(timer);done({exitCode:code,stdout:stdout.slice(0,20000),stderr:stderr.slice(0,20000),timedOut});});});}
  return {directory:root,filesWritten:files.length,totalBytes:total,execution,scope:'sandbox_preparation_only',warning:'This is not an OS-level sandbox. Do not run untrusted generated code here; use a container/VM with resource and network restrictions. The directory is temporary.'};
 }catch(e){await rm(root,{recursive:true,force:true});throw e;}
 finally{if(!keepDirectory)await rm(root,{recursive:true,force:true});}
}
