const MAX_CALLS=10;

export function planMediaBenchmark(dataset,{modality=null,trialsPerPrompt=1,maxCalls=MAX_CALLS}={}){
  if(!dataset||!Array.isArray(dataset.prompts))throw new TypeError('dataset.prompts must be an array');
  if(!Number.isSafeInteger(trialsPerPrompt)||trialsPerPrompt<1)throw new RangeError('trialsPerPrompt must be a positive integer');
  if(!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>MAX_CALLS)throw new RangeError('maxCalls must be between 1 and '+MAX_CALLS);
  if(modality!==null&&!['image','video'].includes(modality))throw new TypeError('modality must be image or video');
  const prompts=dataset.prompts.filter(p=>modality===null||p.modality===modality);
  const planned=prompts.length*trialsPerPrompt;
  if(planned>maxCalls)throw new RangeError('Benchmark plan exceeds maxCalls; reduce prompts or trials');
  return {datasetVersion:dataset.version??'unknown',modality,promptCount:prompts.length,trialsPerPrompt,totalCalls:planned,prompts:prompts.map(p=>({id:p.id,modality:p.modality,category:p.category,prompt:p.prompt}))};
}

export async function executeMediaBenchmarkPlan(plan,{optIn=false,generate,provider,model}={}){
  if(optIn!==true){const error=new Error('Benchmark execution is disabled until explicit opt-in.');error.code='MEDIA_BENCHMARK_OPT_IN_REQUIRED';throw error;}
  if(typeof generate!=='function')throw new TypeError('generate must be a provider adapter function');
  if(typeof provider!=='string'||!provider.trim()||typeof model!=='string'||!model.trim())throw new TypeError('provider and model identifiers are required');
  if(!plan||!Array.isArray(plan.prompts)||!Number.isSafeInteger(plan.totalCalls)||plan.totalCalls<1||plan.totalCalls>MAX_CALLS)throw new TypeError('Invalid or unsafe benchmark plan');
  const trials=[];
  for(const prompt of plan.prompts){
    for(let trial=1;trial<=plan.trialsPerPrompt;trial++){
      const started=performance.now();
      try{
        const result=await generate({prompt:prompt.prompt,modality:prompt.modality,promptId:prompt.id,trial});
        const latencyMs=Number.isFinite(result?.latencyMs)?result.latencyMs:Math.max(0,Math.round(performance.now()-started));
        trials.push({promptId:prompt.id,category:prompt.category,modality:prompt.modality,trial,status:'completed',provider,model,latencyMs,outputAvailable:Boolean(result?.outputAvailable),scores:null});
      }catch(error){
        trials.push({promptId:prompt.id,category:prompt.category,modality:prompt.modality,trial,status:'failed',provider,model,latencyMs:Math.max(0,Math.round(performance.now()-started)),errorCode:typeof error?.code==='string'?error.code:'MEDIA_GENERATION_FAILED'});
      }
    }
  }
  return {benchmarkId:'baye-media-benchmark-v1',datasetVersion:plan.datasetVersion,provider,model,plannedCalls:plan.totalCalls,completedCalls:trials.filter(t=>t.status==='completed').length,failedCalls:trials.filter(t=>t.status==='failed').length,trials,notice:'No media payloads, credentials, prompts beyond test inputs, or provider response bodies are persisted by this runner. Human review scores must be added separately.'};
}
