import { publicPlanCatalog, consumeFreeQuota, quotaUsage, SUBSCRIPTION_PLANS } from './subscription-policy.js';
import { dbReady, initializeAccountQuotaDb, createAccount, loginAccount, authenticateAccount, consumeAccountQuota, accountQuotaUsage, revokeSession } from './account-quota-db.js';
import express from 'express';
import crypto from 'node:crypto';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { buildBayeCorePrompt, getCoreInfo } from './baye-core.js';
import { buildMissionPlan, getIndependentCoreStatus } from './independent-core.js';
import { runOwnedRuntime } from './owned-runtime.js';
import { executeSafeTool, getSafeToolCatalog } from './tool-execution.js';
import { runSafeWorkflow, getWorkflowLimits } from './safe-workflow.js';
import { MemoryEngine } from './memory-engine.js';
import { runMonitor, startPeriodicMonitor, getMonitorStatus, getMonitorHistory } from './baye-monitor.js';
import { createAcademyRouter } from './academy/router.js';
import { buildDomainSystemPrompt, getBayeCapabilityCatalog } from './ai/domain-router.js';
import { requestAICompletion, getAIProviderStatus } from './ai/provider-adapter.js';
import { generateCloudflareImage, getMediaProviderStatus } from './ai/media-adapter.js';
import { verifyTextOutput } from './verification-layer.js';
import { validatePublicImageUrl } from './ai/image-url-validation.js';
import { readJsonLimited } from './ai/bounded-json.js';
import { createVideoSubmitHandler, createVideoStatusHandler } from './ai/video-route-handlers.js';
import { buildOperationalAudit } from './operational-audit.js';
import { buildStudioInstruction } from './studio-engine.js';
import { validateAppBuilderPrompt, parseGeneratedProject, buildAppBuilderInstruction } from './app-builder.js';
import { inspectBuildTestRequest } from './project-build-test-api.js';
import { getOwnedModelDevelopmentStatus, inspectOwnedModelTrainingRequest } from './ai/owned-model-development-api.js';
import { trainOwnedTextPrototype, getOwnedTextPrototypeStatus } from './ai/owned-text-prototype-trainer.js';
import { inspectTextForVerification, getVerificationEngineStatus } from './ai/verification-engine.js';
import { validateDatasetRecord, getDataEngineStatus } from './ai/data-engine.js';
import { inspectDatasetBatch, getDataQualityPipelineStatus } from './ai/data-quality-pipeline.js';
import { inspectControlledDatasetIntake, getControlledIntakeStatus } from './ai/controlled-dataset-intake.js';
import { assessTrainingReadiness, getTrainingReadinessStatus } from './ai/training-readiness.js';
import { configureTrainingExperiment, getTrainingExperimentConfigStatus } from './ai/training-experiment-config.js';
import { createTrainingRun, transitionTrainingRun, getTrainingRun, listTrainingRuns, getTrainingEngineStatus } from './ai/training-engine.js';
import { trainingRunStorageReady, initializeTrainingRunStorage, saveTrainingRunRecord, getStoredTrainingRun, listStoredTrainingRuns, getTrainingRunStorageStatus } from './ai/training-run-storage.js';
import { registryReady, initializeDatasetRegistry, registerDatasetEntry, registryEntryFromIntake, listDatasetEntries, getDatasetVersionHistory, inspectRegistryIntegrity, getDatasetRegistryStatus } from './ai/dataset-registry.js';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// Baseline security headers for API responses.
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({limit:'20kb'}));
const allowedOrigin = process.env.BAYE_ORIGIN || 'https://baye-app.onrender.com';
app.use(cors({origin: allowedOrigin, methods:['POST','GET'], allowedHeaders:['Content-Type','Authorization']}));
app.use('/api/', (req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use('/api/', rateLimit({windowMs:60_000, max:30, standardHeaders:true, legacyHeaders:false}));
const generationLimiter=rateLimit({windowMs:60_000,max:8,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de demandes de génération. Réessaie dans une minute.'}});
const mediaLimiter=rateLimit({windowMs:60_000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de demandes média. Réessaie dans une minute.'}});
const mediaStatusLimiter=rateLimit({windowMs:60_000,max:30,standardHeaders:true,legacyHeaders:false,message:{error:'Trop de vérifications média. Réessaie dans une minute.'}});
app.get('/', (_req,res)=>res.type('text').send('BAYE AI CORE — Gateway online. Use /health for system status.'));
app.get('/health', (_req,res)=>res.json({status:'ok',service:'BAYE AI gateway',core:getCoreInfo(),independentCore:getIndependentCoreStatus()}));
app.get('/api/training-readiness/status', (_req,res)=>res.json(getTrainingReadinessStatus()));
app.get('/api/training-experiments/config/status', (_req,res)=>res.json(getTrainingExperimentConfigStatus()));
import { inspectComputeResources, planComputeDispatch, getComputeWorkerStatus } from './ai/compute-worker-planner.js';
app.get('/api/training-engine/status', (_req,res)=>res.json(getTrainingEngineStatus()));
import { enqueueControlledTask, updateControlledTaskStage, getControlledTask, listControlledTasks, getControlledTaskQueueStatus } from './ai/controlled-task-queue.js';
import { inspectExecutionGate, getExecutionGateStatus } from './ai/controlled-execution-gate.js';
import { buildReleaseReadinessReport } from './ai/release-readiness.js';
import { runLocalApiDiagnostics } from './ai/api-health-diagnostics.js';
import { analyzeDiagnosticReport, compareDiagnosticReports } from './ai/fault-classification.js';
import { ingestFaultAnalysis, listFaultIncidents, resolveFaultIncident, getIncidentTrackingStatus, restoreFaultIncidents } from './ai/incident-tracker.js';
import { synchronizeIncidents } from './ai/incident-synchronization.js';
import { persistentIncidentStorageReady, initializeIncidentStorage, saveIncidentRecord, listStoredIncidents, getStoredIncident, getIncidentStorageStatus } from './ai/incident-storage.js';
import { recordManualTest, listManualTests, getManualTest, getManualTestLedgerStatus } from './ai/manual-test-evidence-ledger.js';
import { manualEvidenceStorageReady, initializeManualEvidenceStorage, persistManualEvidence, listPersistentManualEvidence, getPersistentManualEvidence, getManualEvidenceStorageStatus } from './ai/manual-test-evidence-storage.js';
app.post('/api/diagnostics/analyze',(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});const result=analyzeDiagnosticReport(req.body);res.status(result.status==='rejected'?400:200).json(result);});
app.use('/api/diagnostics/persistent-incidents',(req,res,next)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});next();});
app.get('/api/diagnostics/persistent-incidents/status',async(_req,res)=>res.json(await getIncidentStorageStatus()));
app.get('/api/diagnostics/persistent-incidents',async(req,res)=>{try{if(!persistentIncidentStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});res.json(await listStoredIncidents({status:typeof req.query.status==='string'?req.query.status:'',severity:typeof req.query.severity==='string'?req.query.severity:'',limit:Number(req.query.limit)||100}));}catch(_){res.status(503).json({error:'Incident storage unavailable.'});}});
app.get('/api/diagnostics/persistent-incidents/:id',async(req,res)=>{try{if(!persistentIncidentStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const incident=await getStoredIncident(req.params.id);if(!incident)return res.status(404).json({error:'Incident not found.'});res.json({incident});}catch(_){res.status(503).json({error:'Incident storage unavailable.'});}});
app.post('/api/diagnostics/persistent-incidents',async(req,res)=>{try{if(!persistentIncidentStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const result=await saveIncidentRecord(req.body);res.status(result.status==='rejected'?400:result.status==='capacity'?503:201).json(result);}catch(_){res.status(400).json({error:'Incident rejected or storage unavailable.'});}});
app.get('/api/diagnostics/incidents/status',(_req,res)=>res.json(getIncidentTrackingStatus()));
app.get('/api/diagnostics/incidents',(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});res.json(listFaultIncidents({status:typeof req.query.status==='string'?req.query.status:'',severity:typeof req.query.severity==='string'?req.query.severity:'',limit:Number(req.query.limit)||100}));});
app.post('/api/diagnostics/incidents/ingest',async(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});const result=ingestFaultAnalysis(req.body);if(result.status==='recorded'&&persistentIncidentStorageReady()){try{result.synchronization=await synchronizeIncidents({listTracked:listFaultIncidents,listStored:listStoredIncidents,saveRecord:saveIncidentRecord,restoreTracked:restoreFaultIncidents});}catch(_){result.synchronization={status:'unavailable',storage:'postgresql'};}}res.status(result.status==='rejected'?400:result.status==='capacity'?503:201).json(result);});
app.post('/api/diagnostics/incidents/:id/resolve',async(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});const result=resolveFaultIncident(req.params.id,typeof req.body?.reason==='string'?req.body.reason:'manual resolution');if(result.status==='resolved'&&persistentIncidentStorageReady()){try{result.synchronization=await saveIncidentRecord(result.incident);}catch(_){result.synchronization={status:'unavailable',storage:'postgresql'};}}res.status(result.status==='not-found'?404:result.status==='rejected'?400:200).json(result);});
app.post('/api/diagnostics/incidents/sync',async(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});if(!persistentIncidentStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});try{const result=await synchronizeIncidents({listTracked:listFaultIncidents,listStored:listStoredIncidents,saveRecord:saveIncidentRecord,restoreTracked:restoreFaultIncidents});res.status(result.status==='partial'?207:200).json(result);}catch(_){res.status(503).json({error:'Incident synchronization unavailable.'});}});
app.post('/api/diagnostics/compare',(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});const result=compareDiagnosticReports(req.body?.previous,req.body?.current);res.status(result.status==='rejected'?400:200).json(result);});
app.get('/api/diagnostics/self-test',(req,res)=>{const token=process.env.BAYE_DIAGNOSTICS_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Diagnostics token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});runLocalApiDiagnostics().then(result=>res.status(result.healthy?200:503).json(result)).catch(()=>res.status(503).json({error:'Diagnostics unavailable.'}));});
app.get('/api/release-readiness',(_req,res)=>res.json(buildReleaseReadinessReport({core:getCoreInfo(),independentCore:getIndependentCoreStatus(),provider:getAIProviderStatus(),media:getMediaProviderStatus(),monitor:getMonitorStatus(),workflow:getWorkflowLimits(),tools:getSafeToolCatalog(),executionGate:getExecutionGateStatus()})));
app.use('/api/manual-tests/persistent-evidence',(req,res,next)=>{const token=process.env.BAYE_MANUAL_EVIDENCE_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Manual evidence access token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});next();});
app.get('/api/manual-tests/persistent-evidence/status',async(_req,res)=>res.json(await getManualEvidenceStorageStatus()));
app.get('/api/manual-tests/persistent-evidence',generationLimiter,async(req,res)=>{try{if(!manualEvidenceStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});res.json(await listPersistentManualEvidence({featureId:typeof req.query.featureId==='string'?req.query.featureId:'',outcome:typeof req.query.outcome==='string'?req.query.outcome:'',limit:Number(req.query.limit)||50}));}catch(_){res.status(503).json({error:'Persistent evidence storage unavailable.'});}});
app.get('/api/manual-tests/persistent-evidence/:id',generationLimiter,async(req,res)=>{try{if(!manualEvidenceStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const record=await getPersistentManualEvidence(req.params.id);if(!record)return res.status(404).json({error:'Evidence record not found.'});res.json({record});}catch(_){res.status(503).json({error:'Persistent evidence storage unavailable.'});}});
app.post('/api/manual-tests/persistent-evidence',generationLimiter,async(req,res)=>{try{if(!manualEvidenceStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const result=await persistManualEvidence(req.body);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='capacity')return res.status(503).json(result);res.status(201).json(result);}catch(_){res.status(400).json({error:'Evidence rejected or storage unavailable.'});}});
app.get('/api/execution-gate/status',(_req,res)=>res.json(getExecutionGateStatus()));
app.post('/api/execution-gate/inspect',generationLimiter,(req,res)=>{const result=inspectExecutionGate(req.body);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='blocked')return res.status(422).json(result);res.json(result);});
app.get('/api/compute-worker/status',(_req,res)=>res.json(getComputeWorkerStatus()));
app.get('/api/controlled-task-queue/status',(_req,res)=>res.json(getControlledTaskQueueStatus()));
app.post('/api/controlled-task-queue/tasks',generationLimiter,(req,res)=>{const result=enqueueControlledTask(req.body);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='capacity')return res.status(503).json(result);res.status(201).json(result);});
app.get('/api/controlled-task-queue/tasks',generationLimiter,(_req,res)=>res.json({items:listControlledTasks()}));
app.get('/api/controlled-task-queue/tasks/:id',generationLimiter,(req,res)=>{const task=getControlledTask(req.params.id);if(!task)return res.status(404).json({error:'Task not found.'});res.json({task});});
app.post('/api/controlled-task-queue/tasks/:id/stage',generationLimiter,(req,res)=>{const result=updateControlledTaskStage({...req.body,id:req.params.id});if(result.status==='not-found')return res.status(404).json(result);if(result.status==='rejected')return res.status(400).json(result);res.json(result);});
app.post('/api/compute-worker/resources/inspect',generationLimiter,(req,res)=>{const result=inspectComputeResources(req.body);if(result.status==='rejected')return res.status(400).json(result);res.json(result);});
app.post('/api/compute-worker/dispatch/plan',generationLimiter,(req,res)=>{const result=planComputeDispatch(req.body);if(result.status==='rejected')return res.status(400).json(result);res.json(result);});
app.use('/api/training-engine/storage', (req,res,next)=>{const token=process.env.BAYE_TRAINING_STORAGE_TOKEN;if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Training storage access token is not securely configured.'});if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});next();});\napp.get('/api/training-engine/storage/status', async(_req,res)=>res.json(await getTrainingRunStorageStatus()));
app.post('/api/training-engine/storage/runs', generationLimiter, async(req,res)=>{try{if(!trainingRunStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const result=await saveTrainingRunRecord(req.body);res.status(201).json(result);}catch(e){res.status(400).json({error:'Persistent run record rejected or unavailable.'});}});
app.get('/api/training-engine/storage/runs', generationLimiter, async(req,res)=>{try{if(!trainingRunStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});res.json({items:await listStoredTrainingRuns(Number(req.query.limit)||50)});}catch(_){res.status(503).json({error:'Persistent storage unavailable.'});}});
app.get('/api/training-engine/storage/runs/:id', generationLimiter, async(req,res)=>{try{if(!trainingRunStorageReady())return res.status(503).json({error:'Persistent storage not configured.'});const run=await getStoredTrainingRun(req.params.id);if(!run)return res.status(404).json({error:'Run not found.'});res.json({run});}catch(_){res.status(503).json({error:'Persistent storage unavailable.'});}});
app.post('/api/training-engine/runs', generationLimiter, (req,res)=>{const result=createTrainingRun(req.body);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='capacity')return res.status(503).json(result);res.status(201).json(result);});
app.get('/api/training-engine/runs', generationLimiter, (req,res)=>res.json({items:listTrainingRuns(Number(req.query.limit)||50)}));
app.get('/api/training-engine/runs/:id', generationLimiter, (req,res)=>{const run=getTrainingRun(req.params.id);if(!run)return res.status(404).json({error:'Run not found.'});res.json({run});});
app.post('/api/training-engine/runs/:id/stage', generationLimiter, (req,res)=>{const result=transitionTrainingRun({...req.body,id:req.params.id});if(result.status==='not-found')return res.status(404).json(result);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='blocked')return res.status(422).json(result);res.json(result);});
app.post('/api/training-experiments/configure', generationLimiter, (req,res)=>{const result=configureTrainingExperiment(req.body);if(result.status==='rejected')return res.status(400).json(result);if(result.status==='needs-review')return res.status(422).json(result);res.status(200).json(result);});
app.post('/api/training-readiness/assess', generationLimiter, (req,res)=>{const result=assessTrainingReadiness(req.body);if(result.status==='rejected')return res.status(400).json(result);res.json(result);});
app.get('/api/owned-models/status', (_req,res)=>res.json(getOwnedModelDevelopmentStatus()));
app.get('/api/owned-models/text-prototype/status', (_req,res)=>res.json(getOwnedTextPrototypeStatus()));
app.post('/api/owned-models/text-prototype/train', generationLimiter, (req,res)=>{const result=trainOwnedTextPrototype(req.body);res.status(result.status==='rejected'?400:200).json(result);});
app.get('/api/verification/status', (_req,res)=>res.json(getVerificationEngineStatus()));
app.get('/api/data-engine/status', (_req,res)=>res.json({...getDataEngineStatus(),qualityPipeline:getDataQualityPipelineStatus(),controlledIntake:getControlledIntakeStatus(),datasetRegistry:getDatasetRegistryStatus()}));
app.post('/api/data-engine/intake/preview', generationLimiter, (req,res)=>{const result=inspectControlledDatasetIntake(req.body);if(result.status==='rejected')return res.status(400).json(result);res.status(200).json(result);});
app.post('/api/data-engine/registry/register', generationLimiter, async(req,res)=>{try{if(!registryReady())return res.status(503).json({error:'Dataset registry database is not configured.'});const intake=inspectControlledDatasetIntake(req.body);if(intake.status==='rejected')return res.status(400).json(intake);const built=registryEntryFromIntake(intake);if(!built.valid)return res.status(400).json(built);res.status(201).json(await registerDatasetEntry(built.entry));}catch(_){res.status(503).json({error:'Dataset registry unavailable.'});}});
app.get('/api/data-engine/registry/list',generationLimiter,async(req,res)=>{try{if(!registryReady())return res.status(503).json({error:'Dataset registry database is not configured.'});const limit=Number(req.query.limit)||50,offset=Number(req.query.offset)||0,name=typeof req.query.name==='string'?req.query.name:'',modality=typeof req.query.modality==='string'?req.query.modality:'';res.json({items:await listDatasetEntries({limit,offset,name,modality}),limit:Math.min(100,Math.max(1,Number.isInteger(limit)?limit:50)),offset:Math.min(100000,Math.max(0,Number.isInteger(offset)?offset:0))});}catch(_){res.status(503).json({error:'Dataset registry unavailable.'});}});\napp.get('/api/data-engine/registry/integrity',generationLimiter,async(req,res)=>{try{if(!registryReady())return res.status(503).json({error:'Dataset registry database is not configured.'});res.json(await inspectRegistryIntegrity(Number(req.query.limit)||100));}catch(_){res.status(503).json({error:'Dataset registry integrity inspection unavailable.'});}});\napp.get('/api/data-engine/registry/history',generationLimiter,async(req,res)=>{try{if(!registryReady())return res.status(503).json({error:'Dataset registry database is not configured.'});const name=typeof req.query.name==='string'?req.query.name:'',source=typeof req.query.source==='string'?req.query.source:'';res.json(await getDatasetVersionHistory({name,source,limit:Number(req.query.limit)||100}));}catch(_){res.status(400).json({error:'Dataset version history request invalid or unavailable.'});}});
app.post('/api/data-engine/quality/inspect', generationLimiter, (req,res)=>{const result=inspectDatasetBatch(req.body);if(result.status==='rejected')return res.status(400).json(result);res.status(200).json(result);});
app.post('/api/data-engine/dataset/validate', generationLimiter, (req,res)=>{const result=validateDatasetRecord(req.body);if(!result.valid)return res.status(400).json(result);res.status(202).json(result);});
app.post('/api/verification/inspect', generationLimiter, (req,res)=>{const result=inspectTextForVerification(req.body);if(result.status==='rejected')return res.status(400).json(result);res.status(200).json(result);});
app.post('/api/owned-models/training-plan', generationLimiter, (req,res)=>{const result=inspectOwnedModelTrainingRequest(req.body);if(result.status==='rejected')return res.status(400).json(result);res.status(202).json(result);});
app.get('/api/operational-audit',(req,res)=>{const secret=process.env.BAYE_MONITOR_SECRET;if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Audit access secret is not securely configured'});if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});res.json(buildOperationalAudit());});
app.get('/api/independent-core/status',(_req,res)=>res.json(getIndependentCoreStatus()));
app.post('/api/independent-core/runtime',generationLimiter,(req,res)=>{try{res.json(runOwnedRuntime(req.body?.input));}catch(err){res.status(400).json({error:err.message||'Entrée invalide.'});}});
app.get('/api/independent-core/tools',(_req,res)=>res.json({tools:getSafeToolCatalog(),scope:'allowlisted deterministic local tools; no external side effects'}));
app.post('/api/independent-core/tools/execute',generationLimiter,(req,res)=>{try{const tool=req.body?.tool;if(typeof tool!=='string')return res.status(400).json({error:'Outil requis.'});const result=executeSafeTool(tool,req.body?.input||{});res.json({result,verification:{passed:true,scope:'deterministic tool checks'}});}catch(err){res.status(400).json({error:err.message||'Entrée invalide.'});}});
app.get('/api/independent-core/workflow-limits',(_req,res)=>res.json(getWorkflowLimits()));
app.post('/api/independent-core/workflow',generationLimiter,(req,res)=>{try{res.json(runSafeWorkflow(req.body?.steps));}catch(err){res.status(400).json({error:err.message||'Workflow invalide.'});}});
app.post('/api/independent-core/plan',generationLimiter,(req,res)=>{try{const mission=req.body?.mission;if(typeof mission!=='string'||mission.trim().length===0)return res.status(400).json({error:'Mission requise.'});if(mission.length>4000)return res.status(400).json({error:'Mission trop longue (maximum 4 000 caractères).'});res.json(buildMissionPlan(mission));}catch(_err){res.status(400).json({error:'Mission invalide.'});}})

function secureBearerMatch(req,secret){
  if(typeof secret!=='string'||secret.length<32)return false;
  const supplied=req.get('authorization')||'';
  const expected='Bearer '+secret;
  return supplied.length===expected.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}

// BAYE Memory Engine: all write/search access is protected by a separately configured token.
const memoryEngine=new MemoryEngine();
app.use('/api/memory', (req,res,next)=>{
  const token=process.env.BAYE_MEMORY_TOKEN;
  if(typeof token!=='string'||token.length<32)return res.status(503).json({error:'Memory access token is not securely configured.'});
  if(!secureBearerMatch(req,token))return res.status(401).json({error:'Unauthorized'});
  next();
});
app.get('/api/memory/status',async(req,res)=>{try{res.json(await memoryEngine.status());}catch(_){res.status(500).json({error:'Memory status unavailable.'});}});
app.get('/api/memory/search',async(req,res)=>{try{res.json({items:await memoryEngine.search(typeof req.query.q==='string'?req.query.q:'')});}catch(err){res.status(400).json({error:err.message});}});
app.post('/api/memory',async(req,res)=>{try{res.status(201).json(await memoryEngine.add(req.body||{}));}catch(err){res.status(400).json({error:err.message});}});
app.delete('/api/memory/:id',async(req,res)=>{try{const removed=await memoryEngine.remove(req.params.id);res.json({removed});}catch(err){res.status(400).json({error:err.message});}});
app.delete('/api/memory',async(req,res)=>{try{await memoryEngine.clear();res.json({cleared:true});}catch(_){res.status(500).json({error:'Unable to clear memory.'});}});

app.get('/api/capabilities', (_req,res)=>res.json({ ...getBayeCapabilityCatalog(), providers: getAIProviderStatus(), media: getMediaProviderStatus() }));


// BAYE autonomous monitoring: restricted endpoint; secret must be configured in Render.
app.get('/api/sentinel/status', (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  res.json(getMonitorStatus());
});
app.get('/api/sentinel/history', (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  res.json({items:getMonitorHistory()});
});
app.get('/api/monitor/check', async (req,res)=>{
  const secret=process.env.BAYE_MONITOR_SECRET;
  if(typeof secret!=='string'||secret.length<32)return res.status(503).json({error:'Monitoring access secret is not securely configured'});
  if(!secureBearerMatch(req,secret))return res.status(401).json({error:'Unauthorized'});
  try { res.json(await runMonitor()); }
  catch(_err){ res.status(500).json({error:'Monitoring check failed'}); }
});

app.get('/api/subscription-plans', (_req,res)=>res.json({plans:publicPlanCatalog(),billing:'disabled',accountQuotas:dbReady()?'available':'database_not_configured',note:'Account quota storage requires database configuration.'}));
app.post('/api/accounts/register',async(req,res)=>{try{if(!dbReady())return res.status(503).json({error:'Base de données non configurée.'});const account=await createAccount(req.body?.email,req.body?.password);res.status(201).json({account});}catch(err){res.status(err.status||500).json({error:err.status?err.message:'Création du compte impossible.'});}});
app.post('/api/accounts/login',async(req,res)=>{try{if(!dbReady())return res.status(503).json({error:'Base de données non configurée.'});res.json(await loginAccount(req.body?.email,req.body?.password));}catch(err){res.status(err.status||500).json({error:err.status?err.message:'Connexion impossible.'});}});
app.post('/api/accounts/logout',authenticateAccount,async(req,res)=>{try{await revokeSession(req);res.json({loggedOut:true});}catch(_){res.status(503).json({error:'Déconnexion impossible.'});}});
app.get('/api/accounts/me',authenticateAccount,(req,res)=>res.json({account:req.account}));
app.get('/api/subscription-usage',async(req,res)=>{try{if((req.get('authorization')||'').startsWith('Bearer ')&&dbReady()){await authenticateAccount(req,res,async()=>res.json(await accountQuotaUsage(req.account.id,SUBSCRIPTION_PLANS.free.quotas)));return;}res.json(quotaUsage(req.ip));}catch(_){res.status(503).json({error:'Usage indisponible.'});}});
function enforceFreeQuota(type){return async(req,res,next)=>{const quotaType=typeof type==='function'?type(req):type;try{if((req.get('authorization')||'').startsWith('Bearer ')&&dbReady()){await authenticateAccount(req,res,async()=>{const result=await consumeAccountQuota(req.account.id,quotaType,SUBSCRIPTION_PLANS.free.quotas);if(!result.allowed)return res.status(429).json({error:result.reason==='feature_not_included'?'Cette fonctionnalité est réservée aux abonnements payants.':'Quota gratuit atteint. Abonnez-vous pour continuer.',quota:result});req.quota=result;next();});return;}const result=consumeFreeQuota(req.ip,quotaType);if(!result.allowed)return res.status(429).json({error:result.reason==='feature_not_included'?'Cette fonctionnalité est réservée aux abonnements payants.':'Quota gratuit atteint. Abonnez-vous pour continuer.',quota:result});req.quota=result;next();}catch(_){res.status(503).json({error:'Contrôle du quota indisponible.'});}};}

// BAYE Payments: safe public catalog only; checkout and verification stay disabled until a provider is configured.
app.get('/api/payment-methods', (_req,res)=>res.json({
  paymentSystem:'BAYE Payment Security Core',
  status:'not_configured',
  methods:[
    {id:'wave',name:'Wave',status:'planned'},
    {id:'orange_money',name:'Orange Money',status:'planned'},
    {id:'card',name:'Visa / Mastercard',status:'planned'},
    {id:'paypal',name:'PayPal',status:'planned'},
    {id:'apple_pay',name:'Apple Pay',status:'planned'},
    {id:'google_pay',name:'Google Pay',status:'planned'},
    {id:'djamo',name:'Djamo',status:'needs_provider_validation'}
  ],
  securityPolicy:'No subscription is activated by a user statement, screenshot, or unverified callback. Server-side provider verification is required.'
}));


// BAYE Payment Verification Core v1: verification rules and transaction state primitives.
// Provider webhook verification must be implemented with a provider-specific adapter before live payments.
const paymentStates = new Set(['pending','paid','failed','cancelled','refunded']);
function validatePaymentRecord(record){
  if(!record||typeof record!=='object')return {valid:false,reason:'invalid_record'};
  if(typeof record.transactionId!=='string'||! /^[a-zA-Z0-9_-]{8,200}$/.test(record.transactionId))return {valid:false,reason:'invalid_transaction_id'};
  if(!Number.isSafeInteger(record.amount)||record.amount<=0)return {valid:false,reason:'invalid_amount'};
  if(typeof record.currency!=='string'||! /^[A-Z]{3}$/.test(record.currency))return {valid:false,reason:'invalid_currency'};
  if(!paymentStates.has(record.status))return {valid:false,reason:'invalid_status'};
  return {valid:true};
}
app.post('/api/payment-verification/check-record', (req,res)=>{
  // This endpoint validates record structure only; it does not authenticate a provider payment.
  const result=validatePaymentRecord(req.body);
  res.status(result.valid?200:400).json({valid:result.valid,reason:result.reason||'record_structure_valid',verification:'structure_only',paymentActivationAllowed:false});
});
app.get('/api/payment-verification/status', (_req,res)=>res.json({
  core:'BAYE Payment Verification Core v1',
  mode:'structure_validation_only',
  providerAdaptersConfigured:false,
  livePaymentVerification:false,
  activationRequiresVerifiedProviderWebhook:true,
  checks:['transaction id format','positive integer amount','ISO currency code format','known transaction status'],
  note:'Record validation is not proof of payment. Live activation requires provider authentication, amount/currency/order matching, replay protection, and persistent transaction storage.'
}));


app.use('/api/academy', createAcademyRouter({ callAI }));

async function callAI({key,endpoint,model,messages,max_tokens=4096,temperature=0.4}){
  return requestAICompletion({
    primary: { key, endpoint, model },
    messages,
    max_tokens,
    temperature
  });
}
// Safe build-test API: preflight only; isolated execution remains unavailable unless explicitly wired.
app.post('/api/projects/build-test', generationLimiter, async (req,res)=>{
  try{
    const result=await inspectBuildTestRequest(req.body?.files);
    res.status(result.passed?200:422).json(result);
  }catch(_err){res.status(400).json({passed:false,stage:'request',issues:[{code:'INVALID_BUILD_TEST_REQUEST'}],executionEnabled:false});}
});

// Functional MVP app builder: generates a bounded file manifest, but never executes it.
app.post('/api/projects/generate', generationLimiter, enforceFreeQuota('text'), async (req,res)=>{
  try{
    const checked=validateAppBuilderPrompt(req.body?.prompt);
    if(!checked.valid)return res.status(400).json({error:checked.reason,limit:checked.limit||null});
    const key=process.env.AI_API_KEY;
    if(!key)return res.status(503).json({error:'Le moteur IA n’est pas configuré.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    const generated=await callAI({key,endpoint,model,messages:[
      {role:'system',content:buildAppBuilderInstruction()},
      {role:'user',content:checked.prompt}
    ],max_tokens:7000,temperature:0.25});
    const result=parseGeneratedProject(generated.piece);
    if(!result.passed)return res.status(502).json({error:'Manifest d’application invalide. Réessaie avec une demande plus précise.',validation:result});
    res.json({...result,model:generated.model||model,provider:generated.providerId||'primary'});
  }catch(err){console.error('BAYE app builder error',err);res.status(502).json({error:'BAYE Builder n’a pas pu générer le projet.'});}
});

app.post('/api/generate', generationLimiter, enforceFreeQuota('text'), async (req,res)=>{
  try {
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Écris une demande avant de générer.'});
    if(typeof kind!=='string'||kind.length>80)return res.status(400).json({error:'Type de création invalide.'});
    if(prompt.length>8000) return res.status(400).json({error:'Demande trop longue (maximum 8 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key) return res.status(503).json({error:'Le moteur IA n’est pas encore configuré. Réessaie plus tard.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    let output='',finishReason='stop',actualModel=model,providerId='primary';
    const routed = buildDomainSystemPrompt(kind, prompt);
    const messages=[{role:'system',content:routed.systemPrompt+'\\n\\n'+buildStudioInstruction({kind,prompt,context:{configuredAIProvider:Boolean(process.env.AI_API_KEY),configuredMediaProviders:{image:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),video:Boolean(process.env.FAL_KEY)}}})},{role:'user',content:prompt}];
    for(let part=0;part<3;part++){
      const response=await callAI({key,endpoint,model,messages,max_tokens:8192,temperature:0.7});
      output+=response.piece;finishReason=response.finishReason;actualModel=response.model||actualModel;providerId=response.providerId||providerId;
      if(finishReason!=='length'||part===2)break;
      messages.push({role:'assistant',content:response.piece},{role:'user',content:'Continue exactly where you stopped, without repeating. Complete the answer.'});
    }
    const outputVerification=verifyTextOutput(output,{label:'generation_result',maxLength:100000});
    if(!outputVerification.passed)return res.status(502).json({error:'BAYE a produit une sortie invalide. Réessaie.',verification:outputVerification});
    res.json({result:output,model:actualModel,provider:providerId,core:getCoreInfo(),domain:routed.route,partial:finishReason==='length',verification:{passed:true,scope:'structural_only',checks:outputVerification.checks}});
  } catch(err){console.error('BAYE gateway error',err);res.status(502).json({error:'Le moteur IA rencontre un problème. Réessaie plus tard.'});}
});

// BAYE Agent: two-call cost-conscious workflow (plan + final with built-in quality review).
app.post('/api/agent', generationLimiter, enforceFreeQuota('agent'), async (req,res)=>{
  try{
    const {prompt,kind='Texte'}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim())return res.status(400).json({error:'Écris un objectif avant de lancer BAYE Agent.'});
    if(typeof kind!=='string'||kind.length>80)return res.status(400).json({error:'Type de création invalide.'});
    if(prompt.length>4000)return res.status(400).json({error:'Objectif trop long (maximum 4 000 caractères).'});
    const key=process.env.AI_API_KEY;
    if(!key)return res.status(503).json({error:'Le moteur IA n’est pas configuré.'});
    const endpoint=(process.env.AI_API_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'')+'/chat/completions';
    const model=process.env.AI_MODEL||'gpt-4o-mini';
    const planResponse=await callAI({key,endpoint,model,messages:[
      {role:'system',content:'Tu es BAYE Agent, planificateur. Transforme l’objectif en plan bref de 3 à 5 étapes réalisables en génération de texte uniquement. Ne planifie aucune action externe, aucun achat, aucune publication, aucune modification de compte ni commande système. Retourne une liste numérotée simple.'},
      {role:'user',content:prompt}
    ],max_tokens:900,temperature:0.2});
    const plan=planResponse.piece;
    const planVerification=verifyTextOutput(plan,{label:'plan',maxLength:12000});
    if(!planVerification.passed)return res.status(502).json({error:'BAYE Agent a produit un plan invalide. Réessaie.',verification:planVerification});
    const finalResponse=await callAI({key,endpoint,model,messages:[
      {role:'system',content:buildBayeCorePrompt(kind)+' Tu es BAYE Agent. Réalise le plan fourni. Avant de répondre, vérifie silencieusement les erreurs, omissions, contradictions, sécurité et affirmations non vérifiées; corrige-les. Ne prétends pas avoir réalisé d actions externes ni consulté des sources. Retourne directement la réponse finale.'},
      {role:'user',content:'Objectif : '+prompt+'\nPlan :\n'+plan}
    ],max_tokens:4500,temperature:0.4});
    const outputVerification=verifyTextOutput(finalResponse.piece,{label:'final_response',maxLength:40000});
    if(!outputVerification.passed)return res.status(502).json({error:'BAYE Agent a produit une réponse invalide. Réessaie.',verification:outputVerification});
    res.json({result:finalResponse.piece,plan,model:finalResponse.model||model,provider:finalResponse.providerId||'primary',core:{...getCoreInfo(),agentMode:'prompted-review-plus-structural-verification',steps:2},verification:{passed:true,scope:'structural_only',plan:planVerification,result:outputVerification}});
  }catch(err){console.error('BAYE agent error',err);res.status(502).json({error:'BAYE Agent n’a pas pu terminer. Réessaie plus tard.'});}
});
const falModels = {image:'fal-ai/flux/schnell',video:'fal-ai/kling-video/v2.1/standard/text-to-video'};
const videoSubmitHandler=createVideoSubmitHandler();
const videoStatusHandler=createVideoStatusHandler();
app.post('/api/media/generate', mediaLimiter, enforceFreeQuota(req=>req.body?.type==='video'?'video':'image'), async (req,res)=>{
  try {
    const {prompt,type='image',image_url}=req.body||{};
    if(typeof prompt!=='string'||!prompt.trim()) return res.status(400).json({error:'Prompt requis.'});
    if(prompt.length>2048) return res.status(400).json({error:'Prompt trop long (maximum 2 048 caractères pour le modèle image).'});
    if(!['image','video'].includes(type)) return res.status(400).json({error:'Type invalide.'});
    if(type==='image'){
      const generated=await generateCloudflareImage({prompt:prompt.trim()});
      return res.json(generated);
    }
    return videoSubmitHandler(req,res);
  }catch(err){
    if(err?.code==='MEDIA_NOT_CONFIGURED')return res.status(503).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_INVALID_PROMPT')return res.status(400).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_QUOTA_EXHAUSTED')return res.status(429).json({code:err.code,error:err.message});
    if(err?.code==='MEDIA_PROVIDER_REJECTED'||err?.code==='MEDIA_EMPTY_RESULT'){
      // Provider details contain only Cloudflare error codes/messages, never request headers or secrets.
      console.warn('BAYE Cloudflare image rejection',JSON.stringify({status:err.status||null,code:err.code,providerErrors:err.providerErrors||[]}));
      return res.status(502).json({
        code:err.code,
        error:err.message,
        provider_status:err.status||null,
        provider_errors:err.providerErrors||[]
      });
    }
    console.error('BAYE media error',err);res.status(500).json({error:'Erreur interne du générateur média.'});
  }
});
app.get('/api/media/status', mediaStatusLimiter, videoStatusHandler);
// Normalize unexpected errors without exposing stack traces or secrets to clients.
app.use((err,req,res,next)=>{console.error('Unhandled API error',err?.message||err);if(res.headersSent)return next(err);res.status(500).json({error:'Erreur interne. Réessaie plus tard.'});});
const port=process.env.PORT||10000;if(process.env.DATABASE_URL){initializeIncidentStorage().catch(()=>{console.error('BAYE incident storage initialization failed');});}
app.listen(port,'0.0.0.0',()=>{console.log('BAYE AI gateway listening on '+port);startPeriodicMonitor();if(manualEvidenceStorageReady())initializeManualEvidenceStorage().then(()=>console.log('BAYE manual evidence storage initialized')).catch(err=>console.error('BAYE manual evidence storage initialization failed:',err.message));if(dbReady())initializeAccountQuotaDb().then(()=>console.log('BAYE account/quota database initialized')).catch(err=>console.error('BAYE account DB initialization failed:',err.message));if(registryReady())initializeDatasetRegistry().then(()=>console.log('BAYE dataset registry initialized')).catch(err=>console.error('BAYE dataset registry initialization failed:',err.message));if(trainingRunStorageReady())initializeTrainingRunStorage().then(()=>console.log('BAYE training run storage initialized')).catch(err=>console.error('BAYE training run storage initialization failed:',err.message));});
