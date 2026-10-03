// Calibration shared by the live city's link and the repeatable Quiet replay.
const fields={spacing:[120,48,180],strength:[.5,0,.5],surfaceDetail:[.35,0,1],edges:[2,0,3],dotSize:[1,1,3]};
export function readComparisonSettings(query){
  const result={invertDepth:query.get('direction')==='reversed'};
  for(const [key,[fallback,min,max]] of Object.entries(fields)){
    const raw=query.get(key),value=raw?.trim()?Number(raw):NaN;
    result[key]=Number.isFinite(value)&&value>=min&&value<=max&&(!['edges','dotSize'].includes(key)||Number.isInteger(value))?value:fallback;
  }
  return result;
}
export function comparisonQuery(settings){
  const query=new URLSearchParams({compare:'quiet',direction:settings.invertDepth?'reversed':'original'});
  for(const key of Object.keys(fields))query.set(key,String(settings[key]));
  return query.toString();
}
