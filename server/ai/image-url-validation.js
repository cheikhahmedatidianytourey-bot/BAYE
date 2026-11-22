import {isIP} from 'node:net';

const DNS_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BLOCKED_SUFFIXES=['localhost','local','internal','test','invalid','example'];

export function validatePublicImageUrl(value){
  if(typeof value!=='string'||value.length>2048||/[\s\u0000-\u001f\u007f]/.test(value))return false;
  try{
    const parsed=new URL(value);
    const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
    const authority=value.slice(value.indexOf('//')+2).split(/[/?#]/,1)[0];
    const authorityHost=authority.slice(authority.lastIndexOf('@')+1);
    const explicitPort=authorityHost.startsWith('[')
      ? authorityHost.includes(']:')
      : authorityHost.includes(':');
    const labels=host.split('.');
    const validDns=labels.length>=2&&labels.every(label=>DNS_LABEL.test(label))&&host.length<=253;
    const blockedDomain=BLOCKED_SUFFIXES.some(suffix=>host===suffix||host.endsWith('.'+suffix));
    const blockedNumericHost=/^(?:[0-9]+\.){0,3}[0-9]+$/.test(host);
    const blockedHexHost=/^0x[0-9a-f]+(?:\.0x[0-9a-f]+)*$/i.test(host);
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!explicitPort&&!blockedDomain&&!isIP(host)&&!blockedNumericHost&&!blockedHexHost&&validDns;
  }catch{return false;}
}
