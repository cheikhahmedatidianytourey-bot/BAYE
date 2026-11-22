import {isIP} from 'node:net';

const DNS_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validatePublicImageUrl(value){
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return false;
  try{
    const parsed=new URL(value);
    const host=parsed.hostname.toLowerCase();
    const authority=value.slice(value.indexOf('//')+2).split(/[/?#]/,1)[0];
    const authorityHost=authority.slice(authority.lastIndexOf('@')+1);
    const explicitPort=authorityHost.startsWith('[')
      ? authorityHost.includes(']:')
      : authorityHost.includes(':');
    const labels=host.split('.');
    const validDns=labels.length>=2&&labels.every(label=>DNS_LABEL.test(label))&&host.length<=253;
    const blockedDomain=host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||host.endsWith('.example');
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!explicitPort&&!blockedDomain&&!isIP(host)&&validDns;
  }catch{return false;}
}
