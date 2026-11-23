#!/usr/bin/env node
/**
 * BAYE bounded HTTP load probe. Safe defaults: localhost only, capped traffic,
 * no request body, no auth secrets, no production hostname acceptance.
 */
import http from "node:http";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";

const MAX_REQUESTS = 1000, MAX_DURATION_S = 60, MAX_CONCURRENCY = 10;
function percentile(sorted, p) { if (!sorted.length) return null; return sorted[Math.min(sorted.length-1, Math.ceil(p*sorted.length)-1)]; }
function parseArgs(argv) {
  const o={}; for(let i=0;i<argv.length;i++){ const a=argv[i]; if(a==="--self-test")o.self=true; else if(a.startsWith("--")) { const k=a.slice(2); const v=argv[++i]; if(!v || v.startsWith("--")) throw Error("Missing value for "+a); o[k]=v; } else throw Error("Unexpected argument "+a); }
  return o;
}
function validateTarget(url, allowStaging) {
  const u=new URL(url);
  if(!["http:","https:"].includes(u.protocol)) throw Error("Only HTTP(S) targets are allowed.");
  const local=["localhost","127.0.0.1","::1"].includes(u.hostname);
  if(!local && !(allowStaging && u.protocol==="https:" && /(^|\.)staging\./i.test(u.hostname))) throw Error("Refusing target. Only localhost is allowed; remote targets require --allow-staging and a staging.* hostname.");
  if(/prod|production/i.test(u.hostname)) throw Error("Production targets are prohibited.");
  return u;
}
async function run({url,concurrency=3,requests=100,duration=10,timeout=5000,allowStaging=false}) {
  const target=validateTarget(url,allowStaging);
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>MAX_CONCURRENCY) throw Error("Concurrency must be 1.."+MAX_CONCURRENCY);
  if(!Number.isInteger(requests)||requests<1||requests>MAX_REQUESTS) throw Error("Requests must be 1.."+MAX_REQUESTS);
  if(!Number.isFinite(duration)||duration<1||duration>MAX_DURATION_S) throw Error("Duration must be 1.."+MAX_DURATION_S+" seconds");
  if(!Number.isFinite(timeout)||timeout<100||timeout>15000) throw Error("Timeout must be 100..15000ms");
  const latencies=[], statuses={}, errors=[]; let issued=0, stopAt=performance.now()+duration*1000, abort=false;
  async function worker(){ while(!abort && issued<requests && performance.now()<stopAt){
    issued++; const started=performance.now();
    try { const res=await fetch(target,{method:"GET",signal:AbortSignal.timeout(timeout)}); await res.arrayBuffer(); statuses[res.status]=(statuses[res.status]||0)+1; latencies.push(performance.now()-started); if(res.status>=500) errors.push("HTTP "+res.status); }
    catch(e){errors.push(e.name||"request error");}
  }}
  await Promise.all(Array.from({length:concurrency},worker));
  const sorted=latencies.sort((a,b)=>a-b), elapsed=Math.min(duration,(performance.now()-(stopAt-duration*1000))/1000);
  const result={generatedAt:new Date().toISOString(),target:target.origin+target.pathname,traffic:{requestsIssued:issued,concurrency,durationLimitSeconds:duration,elapsedSeconds:Number(elapsed.toFixed(3)),timeoutMs:timeout},outcomes:{statusCounts:statuses,errors:errors.length, errorTypes:errors.slice(0,20)},latencyMs:{samples:sorted.length,min:sorted.length?Number(sorted[0].toFixed(2)):null,mean:sorted.length?Number((sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(2)):null,p50:sorted.length?Number(percentile(sorted,.50).toFixed(2)):null,p95:sorted.length?Number(percentile(sorted,.95).toFixed(2)):null,p99:sorted.length?Number(percentile(sorted,.99).toFixed(2)):null,max:sorted.length?Number(sorted.at(-1).toFixed(2)):null},requestsPerSecond:Number((issued/Math.max(.001,elapsed)).toFixed(2)),note:"Probe metrics only; not a capacity certification."};
  return result;
}
async function selfTest(){
  const srv=http.createServer((req,res)=>{res.writeHead(200,{"content-type":"text/plain"});res.end("synthetic-ok");});
  await new Promise(resolve=>srv.listen(0,"127.0.0.1",resolve));
  try {const port=srv.address().port; const r=await run({url:"http://127.0.0.1:"+port+"/",concurrency:2,requests:20,duration:3,timeout:2000}); if(r.outcomes.errors!==0||r.outcomes.statusCounts["200"]!==20)throw Error("Self-test assertions failed"); console.log(JSON.stringify({selfTest:"PASS",result:r},null,2));}
  finally {srv.close();}
}
const args=parseArgs(process.argv.slice(2));
if(args.self) await selfTest();
else {
  if(!args.target) throw Error("Provide --target URL (localhost only by default).");
  const report=await run({url:args.target,concurrency:Number(args.concurrency||3),requests:Number(args.requests||100),duration:Number(args.duration||10),timeout:Number(args.timeout||5000),allowStaging:args["allow-staging"]==="true"});
  const file=args.output||"baye-load-report.json"; await writeFile(file,JSON.stringify(report,null,2)+"\n"); console.log(JSON.stringify(report,null,2)); console.log("Report saved: "+file);
}
