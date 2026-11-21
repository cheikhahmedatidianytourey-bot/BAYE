const IMAGE_MODEL='@cf/black-forest-labs/flux-1-schnell';

export function getMediaProviderStatus(env=process.env){
  return {
    image:{provider:'cloudflare-workers-ai',model:IMAGE_MODEL,configured:Boolean(env.CLOUDFLARE_ACCOUNT_ID&&env.CLOUDFLARE_API_TOKEN),freeTierAvailable:true},
    video:{provider:'fal.ai',model:'fal-ai/kling-video/v2.1/standard/text-to-video',configured:Boolean(env.FAL_KEY),freeTierAvailable:false}
  };
}

export async function generateCloudflareImage({prompt,env=process.env,fetchImpl=fetch}){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>2048){const error=new Error('La description doit contenir entre 1 et 2 048 caractères.');error.code='MEDIA_INVALID_PROMPT';throw error;}
  if(!env.CLOUDFLARE_ACCOUNT_ID||!env.CLOUDFLARE_API_TOKEN){
    const error=new Error('La génération d’images nécessite CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN.');
    error.code='MEDIA_NOT_CONFIGURED'; throw error;
  }
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)+'/ai/run/'+IMAGE_MODEL;
  const response=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({prompt,steps:4}),signal:AbortSignal.timeout(90000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success===false){
    // Keep provider diagnostics useful while never returning credentials or request headers.
    const rawErrors=Array.isArray(data?.errors)?data.errors:[];
    const providerErrors=rawErrors.slice(0,4).map(item=>{
      const rawCode=item?.code;
      const rawMessage=typeof item?.message==='string'?item.message:'';
      const message=rawMessage
        .replaceAll(String(env.CLOUDFLARE_API_TOKEN),'[REDACTED]')
        .replaceAll(String(env.CLOUDFLARE_ACCOUNT_ID),'[REDACTED]')
        .replace(/[\\r\\n\\t]+/g,' ')
        .slice(0,240);
      return {code:Number.isFinite(Number(rawCode))?Number(rawCode):undefined,message:message||'Cloudflare a retourné une erreur sans détail.'};
    });
    const providerText=JSON.stringify({errors:providerErrors,messages:data?.messages||[]}).toLowerCase();
    const quota=response.status===429||((response.status===403||response.status===400)&&/(quota|neurons|daily limit|exceeded.*limit|billing limit)/.test(providerText));
    const permission=response.status===401||response.status===403;
    const error=new Error(quota
      ?'Quota Workers AI atteint ou limite du compte. BAYE n’effectuera aucune bascule payante.'
      :permission
        ?'Cloudflare a refusé l’accès : vérifie le jeton, ses autorisations Workers AI et le compte associé.'
        :'Cloudflare a refusé la requête. Consulte le diagnostic technique pour identifier le modèle ou le paramètre concerné.');
    error.code=quota?'MEDIA_QUOTA_EXHAUSTED':'MEDIA_PROVIDER_REJECTED';
    error.status=response.status;
    error.providerErrors=providerErrors;
    throw error;
  }
  const image=data?.result?.image;
  if(typeof image!=='string'||!image.length){const error=new Error('Le fournisseur n’a retourné aucune image exploitable.');error.code='MEDIA_EMPTY_RESULT';throw error;}
  return {status:'COMPLETED',provider:'cloudflare-workers-ai',model:IMAGE_MODEL,result:{images:[{url:'data:image/jpeg;base64,'+image}]}};
}