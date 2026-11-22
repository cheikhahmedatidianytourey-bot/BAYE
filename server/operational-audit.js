// Read-only operational audit: reports configuration/structural signals, never secrets.
import {getAIProviderStatus} from './ai/provider-adapter.js';
import {getMediaProviderStatus} from './ai/media-adapter.js';
import {getIndependentCoreStatus} from './independent-core.js';
import {getWorkflowLimits} from './safe-workflow.js';
import {getSafeToolCatalog} from './tool-execution.js';
import {getMonitorStatus} from './baye-monitor.js';
import {getCoreInfo} from './baye-core.js';

export function buildOperationalAudit(env=process.env){
 const providers=getAIProviderStatus(env),media=getMediaProviderStatus(env),core=getIndependentCoreStatus(),monitor=getMonitorStatus();
 const checks=[
  {id:'primary_ai_provider',status:providers.primaryConfigured?'configured':'missing',severity:providers.primaryConfigured?'info':'warning'},
  {id:'fallback_provider',status:providers.fallbackConfigured?'configured':'not_configured',severity:'info'},
  {id:'image_provider',status:media.image.configured?'configured':'missing',severity:media.image.configured?'info':'warning'},
  {id:'video_provider',status:media.video.configured?'configured':'missing',severity:media.video.configured?'info':'warning'},
  {id:'memory_token',status:typeof env.BAYE_MEMORY_TOKEN==='string'&&env.BAYE_MEMORY_TOKEN.length>=32?'configured':'missing_or_weak',severity:typeof env.BAYE_MEMORY_TOKEN==='string'&&env.BAYE_MEMORY_TOKEN.length>=32?'info':'warning'},
  {id:'monitor_secret',status:typeof env.BAYE_MONITOR_SECRET==='string'&&env.BAYE_MONITOR_SECRET.length>=32?'configured':'missing_or_weak',severity:typeof env.BAYE_MONITOR_SECRET==='string'&&env.BAYE_MONITOR_SECRET.length>=32?'info':'warning'},
  {id:'memory_storage',status:env.BAYE_MEMORY_FILE?'custom_path_configured':'default_path',severity:'warning',note:'Persistent durability depends on host disk configuration; this audit does not verify mount durability.'},
  {id:'monitor',status:monitor.status,severity:monitor.status==='healthy'?'info':'warning'},
  {id:'autonomous_tools',status:'limited_allowlist',severity:'warning',note:'Only deterministic calculator and text statistics tools are available.'},
  {id:'independent_model',status:core.trainedFoundationModel?'trained_model_present':'not_trained',severity:'warning'},
  {id:'payments',status:'not_live_verified',severity:'warning'}
 ];
 return {name:'BAYE Read-only Operational Audit',version:'0.1.0',generatedAt:new Date().toISOString(),overall:'diagnostic_only',core:getCoreInfo(),independentCore:{version:core.version,providerIndependent:core.providerIndependent,executionScope:core.executionScope},workflowLimits:getWorkflowLimits(),toolCount:getSafeToolCatalog().length,checks,disclaimer:'Configuration indicators only: no secrets disclosed, no external tests executed, no configuration changed. This report does not prove service security or live availability.'};
}
