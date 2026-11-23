#!/usr/bin/env node
// BAYE capability scorecard: summarizes a JSON array of test records.
// Each record: {id, category, status, critical?, evidence?}
import {readFile} from "node:fs/promises";
const file=process.argv[2];
if(!file) throw new Error("Usage: node scripts/baye-scorecard.mjs <results.json>");
const data=JSON.parse(await readFile(file,"utf8"));
if(!Array.isArray(data)||!data.length) throw new Error("Input must be a non-empty array.");
const allowed=new Set(["pass","fail","blocked","skipped","inconclusive"]);
const seen=new Set();
for(const r of data){
 if(!r||typeof r.id!=="string"||!r.id||typeof r.category!=="string"||!r.category||!allowed.has(r.status)) throw new Error("Invalid record shape or status.");
 if(seen.has(r.id)) throw new Error("Duplicate test id: "+r.id);
 seen.add(r.id);
}
const counts=Object.fromEntries([...allowed].map(s=>[s,data.filter(r=>r.status===s).length]));
const dims={};
for(const category of [...new Set(data.map(r=>r.category))]){
 const records=data.filter(r=>r.category===category), executed=records.filter(r=>["pass","fail"].includes(r.status));
 dims[category]={total:records.length,executed:executed.length,coveragePct:records.length?Number((executed.length/records.length*100).toFixed(1)):0,passed:executed.filter(r=>r.status==="pass").length,failed:executed.filter(r=>r.status==="fail").length,scorePct:executed.length?Number((executed.filter(r=>r.status==="pass").length/executed.length*100).toFixed(1)):null};
}
const criticalFailures=data.filter(r=>r.critical===true&&r.status==="fail").map(r=>r.id);
const summary={suite:"BAYE scorecard",generatedAt:new Date().toISOString(),total:data.length,counts,dimensions:dims,criticalFailures,releaseSignal:criticalFailures.length?"BLOCKED — critical failure":"NO AUTOMATIC RELEASE APPROVAL — review evidence, coverage and other gates"};
console.log(JSON.stringify(summary,null,2));
