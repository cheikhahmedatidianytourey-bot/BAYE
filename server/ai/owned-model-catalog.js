// BAYE-owned model development catalog: tracks model families and their intended capabilities.
// This catalog does not claim models are trained or deployed; lifecycle states are explicit.
const entries = [
 {id:'baye-core-model',name:'BAYE CORE MODEL',modality:['text'],purpose:'Core language, reasoning and orchestration model development',stage:'research',ownership:'target-owned'},
 {id:'baye-vision',name:'BAYE VISION',modality:['image'],purpose:'Native image generation and visual understanding model development',stage:'research',ownership:'target-owned'},
 {id:'baye-motion',name:'BAYE MOTION',modality:['video'],purpose:'Native video generation and temporal consistency model development',stage:'research',ownership:'target-owned'},
 {id:'baye-audio',name:'BAYE AUDIO',modality:['audio'],purpose:'Speech and sound model development',stage:'research',ownership:'target-owned'}
];
export function getOwnedModelCatalog(){return entries.map(x=>({...x,stage:x.stage,trainingStatus:'not-trained-in-this-repository'}));}
export function getOwnedModel(id){return entries.find(x=>x.id===id)||null;}
export function validateTrainingManifest(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {valid:false,error:'Manifest must be an object.'};
 const model=getOwnedModel(input.modelId);
 if(!model)return {valid:false,error:'Unknown BAYE model family.'};
 if(typeof input.datasetName!=='string'||!input.datasetName.trim()||input.datasetName.length>120)return {valid:false,error:'Dataset name must be 1–120 characters.'};
 if(!Array.isArray(input.objectives)||input.objectives.length<1||input.objectives.length>10||input.objectives.some(x=>typeof x!=='string'||!x.trim()||x.length>240))return {valid:false,error:'Provide 1–10 bounded training objectives.'};
 if(!input.config||typeof input.config!=='object'||Array.isArray(input.config))return {valid:false,error:'Training config must be an object.'};
 const config=input.config;
 if(!Number.isInteger(config.epochs)||config.epochs<1||config.epochs>100)return {valid:false,error:'epochs must be an integer between 1 and 100.'};
 if(typeof config.learningRate!=='number'||!Number.isFinite(config.learningRate)||config.learningRate<=0||config.learningRate>1)return {valid:false,error:'learningRate must be between 0 and 1.'};
 if(!Number.isInteger(config.batchSize)||config.batchSize<1||config.batchSize>512)return {valid:false,error:'batchSize must be between 1 and 512.'};
 return {valid:true,manifest:{modelId:model.id,datasetName:input.datasetName.trim(),objectives:input.objectives.map(x=>x.trim()),config:{epochs:config.epochs,learningRate:config.learningRate,batchSize:config.batchSize},status:'planning-only',executionEnabled:false}};
}
