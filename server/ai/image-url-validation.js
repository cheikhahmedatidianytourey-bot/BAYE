import {isIP} from 'node:net';

export function validatePublicImageUrl(value){
  if(typeof value!=='string'||value.length>2048||/[\\s\\u0000-\\u001f\\u007f]/.test(value))return false;
  try{
    const parsed=new URL(value),host=parsed.hostname.toLowerCase();
    const blockedDomain=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example');
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!blockedDomain&&!isIP(host)&&host.includes('.');
  }catch{return false;}
}
