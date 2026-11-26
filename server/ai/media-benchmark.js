const SCORE_FIELDS = Object.freeze(['promptAdherence','photorealism','physicalPlausibility','temporalConsistency','artifactControl']);
const SCORE_MIN=1,SCORE_MAX=5;

export const MEDIA_BENCHMARK_FIELDS=SCORE_FIELDS;

export function validateMediaBenchmarkRecord(record){
  if(!record||typeof record!=='object'||Array.isArray(record))return {valid:false,errors:['record must be an object']};
  const errors=[];
  for(const field of ['benchmarkId','provider','model','modality','promptId','trial','latencyMs']){
    if(record[field]===undefined||record[field]===null||record[field]==='')errors.push(field+' is required');
  }
  if(!['image','video'].includes(record.modality))errors.push('modality must be image or video');
  if(!Number.isSafeInteger(record.trial)||record.trial<1)errors.push('trial must be a positive integer');
  if(!Number.isFinite(record.latencyMs)||record.latencyMs<0)errors.push('latencyMs must be a non-negative number');
  if(record.scores){
    for(const field of SCORE_FIELDS){
      const value=record.scores[field];
      if(!Number.isInteger(value)||value<SCORE_MIN||value>SCORE_MAX)errors.push('scores.'+field+' must be an integer from 1 to 5');
    }
  }else errors.push('scores are required');
  return {valid:errors.length===0,errors};
}

export function scoreMediaBenchmarkRecord(record){
  const validation=validateMediaBenchmarkRecord(record);
  if(!validation.valid){const error=new Error('Invalid media benchmark record');error.code='MEDIA_BENCHMARK_INVALID_RECORD';error.details=validation.errors;throw error;}
  const values=SCORE_FIELDS.map(field=>record.scores[field]);
  const score=Number((values.reduce((sum,value)=>sum+value,0)/values.length).toFixed(2));
  return {score,scale:{min:SCORE_MIN,max:SCORE_MAX},fields:[...SCORE_FIELDS],humanReviewed:true};
}

export function createMediaBenchmarkRecord(input){
  const record={...input};
  const validation=validateMediaBenchmarkRecord(record);
  if(!validation.valid){const error=new Error('Invalid media benchmark record');error.code='MEDIA_BENCHMARK_INVALID_RECORD';error.details=validation.errors;throw error;}
  return {...record,scoreSummary:scoreMediaBenchmarkRecord(record)};
}
