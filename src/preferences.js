const choices={'stereo-window':['0','2','3','4'],pattern:['quiet','chroma','chroma-soft','scene','geometry','classic','mono','foundation-binary','foundation-white','foundation-pink'],grain:['1','2','3'],edges:['0','1','2','3'],quality:['auto','1','0.75','0.5']};
const ranges={spacing:[48,180],strength:[0,50],'surface-detail':[0,100]};
export const VIEWING_DEFAULTS=Object.freeze({'stereo-window':'0',pattern:'foundation-pink',grain:'1',edges:'0',quality:'auto',spacing:'96',strength:'33','surface-detail':'35','motion-stability':false,'quiet-stability':false,'invert-depth':false,'foundation-motion':true});
// Changing any starting value automatically retires saved tuning from that preset.
const presetSignature=JSON.stringify(VIEWING_DEFAULTS);
const KEY='depthwalk-viewing-v1';
export function sanitizePreferences(value){
  const result={...VIEWING_DEFAULTS};if(!value||typeof value!=='object')return result;
  for(const [id,allowed] of Object.entries(choices))if(allowed.includes(value[id]))result[id]=value[id];
  for(const [id,[min,max]] of Object.entries(ranges))if(typeof value[id]==='string'&&value[id].trim()!==''&&Number.isFinite(Number(value[id]))&&Number(value[id])>=min&&Number(value[id])<=max)result[id]=String(Number(value[id]));
  if(typeof value['motion-stability']==='boolean')result['motion-stability']=value['motion-stability'];
  if(typeof value['quiet-stability']==='boolean')result['quiet-stability']=value['quiet-stability'];
  if(typeof value['invert-depth']==='boolean')result['invert-depth']=value['invert-depth'];
  if(typeof value['foundation-motion']==='boolean')result['foundation-motion']=value['foundation-motion'];
  return result;
}
export function loadPreferences(storage){
  try{
    const saved=JSON.parse(storage.getItem(KEY));
    if(!saved||typeof saved!=='object'||saved.presetSignature!==presetSignature)return {...VIEWING_DEFAULTS};
    return sanitizePreferences(saved);
  }catch{return {...VIEWING_DEFAULTS};}
}
export function savePreferences(storage,value){try{storage.setItem(KEY,JSON.stringify({...sanitizePreferences(value),presetSignature}));return true;}catch{return false;}}
