import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBayeCorePrompt, getCoreInfo } from '../server/baye-core.js';
import { checkEndpoint, runMonitor } from '../server/baye-monitor.js';
import { createServer } from 'node:http';

test('core info exposes expected name and version',()=>{
  const info=getCoreInfo();assert.equal(info.name,'BAYE AI CORE');assert.equal(info.version,'2.0.0');
});
test('core prompt routes Code tasks to coding guidance',()=>{
  const prompt=buildBayeCorePrompt('Code');assert.match(prompt,/maintainable, complete code/i);assert.match(prompt,/security risks/i);
});
test('monitor rejects missing URL without network access',async()=>{
  const result=await checkEndpoint('');assert.equal(result.ok,false);assert.equal(result.error,'Endpoint not configured');
});
test('monitor identifies a local healthy endpoint',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(200);res.end('ok');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  try{const result=await checkEndpoint('http://127.0.0.1:'+address.port);assert.equal(result.ok,true);assert.equal(result.status,200);assert.equal(typeof result.latencyMs,'number');}
  finally{await new Promise(resolve=>server.close(resolve));}
});
test('monitor marks HTTP error endpoint unhealthy',async()=>{
  const server=createServer((_req,res)=>{res.writeHead(503);res.end('unavailable');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  try{const result=await checkEndpoint('http://127.0.0.1:'+address.port);assert.equal(result.ok,false);assert.equal(result.status,503);}
  finally{await new Promise(resolve=>server.close(resolve));}
});

test('monitor handles endpoint timeout',async()=>{
  const server=createServer(()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  try{const result=await checkEndpoint('http://127.0.0.1:'+address.port,100);assert.equal(result.ok,false);assert.equal(result.error,'Timeout');}
  finally{server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
});

test('concurrent SENTINEL requests share one monitoring cycle',async()=>{
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return new Response('ok',{status:200});};
  try{
    const [first,second]=await Promise.all([runMonitor(),runMonitor()]);
    assert.equal(first,second);
    assert.equal(calls,2);
    assert.equal(first.overallOk,true);
  }finally{globalThis.fetch=originalFetch;}
});
