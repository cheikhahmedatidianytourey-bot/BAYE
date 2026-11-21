const IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';

export function getMediaProviderStatus(env=process.env){
  return {
    image:{provider:'cloudflare-workers-ai',model:IMAGE_MODEL,configured:Boolean(env.CLOUDFLARE_ACCOUNT_ID&&env.CLOUDFLARE_API_TOKEN),freeTierAvailable:true},
    video:{provider:'fal.ai',model:'fal-ai/kling-video/v2.1/standard/text-to-video',configured:Boolean(env.FAL_KEY),freeTierAvailable:false}
  };
}

export async function generateCloudflareImage({prompt,env=process.env,fetchImpl=fetch}){
  if(!env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN){
    const error=new Error('La génération d’images nécessite CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN.');
    error.code='MEDIA_NOT_CONFIGURED'; throw error;
  }
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/ai/run/'+IMAGE_MODEL;
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({prompt,steps:4}),signal:AbortSignal.timeout(90000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success===false){
    const error=new Error(response.status===429?'Quota gratuit Cloudflare atteint ou limite temporaire.':'Le fournisseur image a refusé la génération.');
    error.code=response.status===429?'MEDIA_QUOTA_EXHAUSTED':'MEDIA_PROVIDER_REJECTED'; throw error;
  }
  const image=data?.result?.image;
  if(typeof image!=='string'||!image.length){const error=new Error('Le fournisseur n’a retourné aucune image exploitable.');error.code='MEDIA_EMPTY_RESULT';throw error;}
  return {status:'COMPLETED',provider:'cloudflare-workers-ai',model:IMAGE_MODEL,result:{images:[{url:'data:image/jpeg;base64,'+image}]}};
}