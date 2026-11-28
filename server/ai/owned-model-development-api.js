import {getOwnedModelCatalog,validateTrainingManifest} from './owned-model-catalog.js';
export function inspectOwnedModelTrainingRequest(body){
 const result=validateTrainingManifest(body);
 return result.valid?{status:'accepted-for-planning',executionEnabled:false,manifest:result.manifest}:{status:'rejected',executionEnabled:false,error:result.error};
}
export function getOwnedModelDevelopmentStatus(){
 return {initiative:'BAYE-owned-model-development',executionEnabled:false,trainingInfrastructure:'not-provisioned',catalog:getOwnedModelCatalog(),capabilities:['catalog model families','validate training-plan manifests','prepare evaluation and training work'],limitations:['No model weights trained or hosted by this API','No datasets accessed','No training job executed','No GPU infrastructure provisioned']};
}
