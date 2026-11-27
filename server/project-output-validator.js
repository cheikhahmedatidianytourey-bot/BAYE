const DEFAULT_MAX_FILES=200;
const DEFAULT_MAX_TOTAL_BYTES=2_000_000;
const DEFAULT_MAX_PATH_LENGTH=240;

export function validateProjectFiles(files,{maxFiles=DEFAULT_MAX_FILES,maxTotalBytes=DEFAULT_MAX_TOTAL_BYTES,maxPathLength=DEFAULT_MAX_PATH_LENGTH}={}){
  const issues=[];
  if(!Array.isArray(files)){return {passed:false,filesChecked:0,totalBytes:0,issues:[{code:'FILES_NOT_ARRAY'}],scope:'structure_only'};}
  if(files.length===0)issues.push({code:'EMPTY_PROJECT'});
  if(files.length>maxFiles)issues.push({code:'TOO_MANY_FILES',limit:maxFiles});
  const seen=new Set();let totalBytes=0;
  for(let i=0;i<files.length;i++){
    const file=files[i];
    if(!file||typeof file!=='object'){issues.push({code:'INVALID_FILE_ENTRY',index:i});continue;}
    const path=file.path;
    if(typeof path!=='string'||!path.trim()){issues.push({code:'INVALID_PATH',index:i});continue;}
    if(path.length>maxPathLength)issues.push({code:'PATH_TOO_LONG',path});
    if(path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>part==='..'||part==='.'||part===''))issues.push({code:'UNSAFE_PATH',path});
    if(seen.has(path))issues.push({code:'DUPLICATE_PATH',path});else seen.add(path);
    if(typeof file.content!=='string')issues.push({code:'CONTENT_NOT_STRING',path});
    else totalBytes+=Buffer.byteLength(file.content,'utf8');
  }
  if(totalBytes>maxTotalBytes)issues.push({code:'TOTAL_SIZE_EXCEEDED',limit:maxTotalBytes});
  return {passed:issues.length===0,filesChecked:files.length,totalBytes,issues,scope:'structure_only',limitation:'Checks file manifest structure, path safety and size only; does not execute, compile, or verify application behavior.'};
}
