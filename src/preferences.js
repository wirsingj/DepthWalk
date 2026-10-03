const choices={'stereo-window':['0','2','3','4'],pattern:['quiet','chroma','chroma-soft','scene','geometry','classic','mono'],grain:['1','2','3'],edges:['0','1','2','3'],quality:['auto','1','0.75','0.5']};
const ranges={spacing:[48,180],strength:[0,50],'surface-detail':[0,100]};
export const VIEWING_DEFAULTS=Object.freeze({'stereo-window':'0',pattern:'quiet',grain:'1',edges:'2',quality:'auto',spacing:'120',strength:'50','surface-detail':'35','motion-stability':true,'quiet-stability':false,'invert-depth':false});
const KEY='depthwalk-viewing-v1';
export function sanitizePreferences(value){
  const result={...VIEWING_DEFAULTS};if(!value||typeof value!=='object')return result;
  for(const [id,allowed] of Object.entries(choices))if(allowed.includes(value[id]))result[id]=value[id];
  for(const [id,[min,max]] of Object.entries(ranges))if(typeof value[id]==='string'&&value[id].trim()!==''&&Number.isFinite(Number(value[id]))&&Number(value[id])>=min&&Number(value[id])<=max)result[id]=String(Number(value[id]));
  if(typeof value['motion-stability']==='boolean')result['motion-stability']=value['motion-stability'];
  if(typeof value['quiet-stability']==='boolean')result['quiet-stability']=value['quiet-stability'];
  if(typeof value['invert-depth']==='boolean')result['invert-depth']=value['invert-depth'];
  return result;
}
export function loadPreferences(storage){
  try{
    const saved=JSON.parse(storage.getItem(KEY));
    if(!saved||typeof saved!=='object')return {...VIEWING_DEFAULTS};
    // Retire the accidentally reversed default independently of layout migration.
    return sanitizePreferences({...saved,...(saved.layoutRevision!==2?{'stereo-window':'0'}:{}),...(saved.depthDirectionRevision!==1?{'invert-depth':false}:{})});
  }catch{return {...VIEWING_DEFAULTS};}
}
export function savePreferences(storage,value){try{storage.setItem(KEY,JSON.stringify({...sanitizePreferences(value),layoutRevision:2,depthDirectionRevision:1}));return true;}catch{return false;}}
