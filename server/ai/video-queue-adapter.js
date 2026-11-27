const MODEL='fal-ai/kling-video/v2.1/standard/text-to-video';
const REQUEST_ID=/^[a-zA-Z0-9_-]{1,200}$/;

export async function submitVideo({prompt,image_url,apiKey,fetchImpl=fetch}={}){
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>2048)throw Object.assign(new Error('Invalid prompt'),{code:'INVALID_PROMPT'});
 if(typeof apiKey!=='string'||!apiKey)throw Object.assign(new Error('Missing provider key'),{code:'NOT_CONFIGURED'});
 const payload={prompt:prompt.trim()};if(image_url)payload.image_url=image_url;
 const response=await fetchImpl('https://queue.fal.run/'+MODEL,{method:'POST',headers:{Authorization:'Key '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 if(!response.ok)throw Object.assign(new Error('Provider rejected submission'),{code:'PROVIDER_REJECTED',status:response.status});
 const data=await readBoundedJson(response);
 if(typeof data?.request_id!=='string'||!REQUEST_ID.test(data.request_id))throw Object.assign(new Error('Invalid request id'),{code:'INVALID_REQUEST_ID'});
 return {request_id:data.request_id,model:MODEL,type:'video',status_url:'/api/media/status?type=video&request_id='+encodeURIComponent(data.request_id)};
}
export async function checkVideoStatus({request_id,apiKey,fetchImpl=fetch}={}){
 if(typeof apiKey!=='string'||!apiKey)throw Object.assign(new Error('Missing provider key'),{code:'NOT_CONFIGURED'});
 if(typeof request_id!=='string'||!REQUEST_ID.test(request_id))throw Object.assign(new Error('Invalid request id'),{code:'INVALID_REQUEST_ID'});
 const base='https://queue.fal.run/'+MODEL+'/requests/'+request_id;
 const statusResponse=await fetchImpl(base+'/status',{headers:{Authorization:'Key '+apiKey}});
 if(!statusResponse.ok)throw Object.assign(new Error('Status unavailable'),{code:'STATUS_FAILED',status:statusResponse.status});
 const statusData=await readBoundedJson(statusResponse,1024*1024);
 if(typeof statusData?.status!=='string')throw Object.assign(new Error('Invalid status payload'),{code:'INVALID_STATUS'});
 if(statusData.status!=='COMPLETED')return {status:statusData.status};
 const resultResponse=await fetchImpl(base,{headers:{Authorization:'Key '+apiKey}});
 if(!resultResponse.ok)throw Object.assign(new Error('Result unavailable'),{code:'RESULT_FAILED',status:resultResponse.status});
 return {status:'COMPLETED',result:await readBoundedJson(resultResponse)};
}
async function readBoundedJson(response,maxBytes=1024*1024){
 const length=response.headers?.get?.('content-length');
 if(length!==null&&length!==undefined&&Number(length)>maxBytes)throw Object.assign(new Error('Response size limit exceeded'),{code:'RESPONSE_TOO_LARGE'});
 const data=await response.json();
 if(Buffer.byteLength(JSON.stringify(data),'utf8')>maxBytes)throw Object.assign(new Error('Response size limit exceeded'),{code:'RESPONSE_TOO_LARGE'});
 return data;
}
