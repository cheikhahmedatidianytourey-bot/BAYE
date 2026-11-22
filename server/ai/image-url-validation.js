import {isIP} from 'node:net';

export function validatePublicImageUrl(value){
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return false;
  try{
    const parsed=new URL(value);
    const host=parsed.hostname.toLowerCase();
    // Reject any explicit port in the original authority, including :443 normalized away by URL.
    const authority=value.slice(value.indexOf('//')+2).split(/[/?#]/,1)[0];
    const authorityHost=authority.slice(authority.lastIndexOf('@')+1);
    const explicitPort=authorityHost.startsWith('[')
      ? authorityHost.includes(']:')
      : authorityHost.includes(':');
    const blockedDomain=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example');
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!explicitPort&&!blockedDomain&&!isIP(host)&&host.includes('.');
  }catch{return false;}
}
