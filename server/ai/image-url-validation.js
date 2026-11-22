import {isIP} from 'node:net';
import {resolve4,resolve6} from 'node:dns/promises';

const DNS_LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BLOCKED_SUFFIXES=['localhost','local','internal','test','invalid','example'];
function isPublicIp(address){
  const family=isIP(address);
  if(family===4){
    const p=address.split('.').map(Number);
    return !(p[0]===0||p[0]===10||p[0]===127||p[0]>=224||
      (p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||
      (p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||
      (p[0]===192&&p[1]===0)||(p[0]===192&&p[1]===2)||
      (p[0]===198&&(p[1]===18||p[1]===19||p[1]===51))||
      (p[0]===203&&p[1]===0&&p[2]===113));
  }
  if(family===6){
    const v=address.toLowerCase();
    // Conservative allow-list: global-unicast 2000::/3 only, excluding documentation and transition ranges.
    return v.startsWith('2')||v.startsWith('3') ? !(/^(2001:db8|2001:0|2002:|3fff:)/i.test(v)) : false;
  }
  return false;
}
export async function validatePublicImageUrl(value,{resolver=async host=>{
  const results=await Promise.allSettled([resolve4(host),resolve6(host)]);
  return results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
}}={}){
  if(typeof value!=='string'||value.length>2048||/[\s\\\u0000-\u001f\u007f]/.test(value))return false;
  try{
    const parsed=new URL(value);
    const rawAuthority=value.slice(value.indexOf('//')+2).split(/[/?#]/,1)[0];
    const authorityHost=rawAuthority.slice(rawAuthority.lastIndexOf('@')+1);
    if(authorityHost.includes('%'))return false;
    const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
    const explicitPort=authorityHost.startsWith('[')?authorityHost.includes(']:'):authorityHost.includes(':');
    const labels=host.split('.');
    const validDns=labels.length>=2&&labels.every(label=>DNS_LABEL.test(label))&&host.length<=253;
    const blockedDomain=BLOCKED_SUFFIXES.some(suffix=>host===suffix||host.endsWith('.'+suffix));
    const blockedNumericHost=/^(?:[0-9]+\.){0,3}[0-9]+$/.test(host);
    const blockedHexHost=/^0x[0-9a-f]+(?:\.0x[0-9a-f]+)*$/i.test(host);
    if(!(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&!explicitPort&&!blockedDomain&&!isIP(host)&&!blockedNumericHost&&!blockedHexHost&&validDns))return false;
    const addresses=await resolver(host);
    return Array.isArray(addresses)&&addresses.length>0&&addresses.every(isPublicIp);
  }catch{return false;}
}
