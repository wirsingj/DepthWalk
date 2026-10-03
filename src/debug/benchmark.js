import {DepthWalkFilter} from '../depthwalk.js';
import {observeFrame,evaluateObserver,compareFramePair,summarizeMotion,diagnose,measureColorSpread,OBSERVER_VERSION} from './observer.js';
import {imageFidelity} from './image-fidelity.js';
import {validateDepthFrame} from '../depth-frame.js';
import {validateSceneColor} from '../scene-color.js';
import {analyzeColorConstraints} from './color-constraints.js';
import {evaluateCandidate} from './candidate-gates.js';
import {invertDepthFrame} from '../depth-direction.js';
export const PROFILES=[
  {id:'quiet',label:'Quiet · 65%',pattern:'quiet',surfaceDetail:.65},
  {id:'paired',label:'Paired · stable · 65%',pattern:'chroma',surfaceDetail:.65,temporalStability:true},
  {id:'unsteady',label:'Paired · history off',pattern:'chroma',surfaceDetail:.65,temporalStability:false},
  {id:'sparse',label:'Rejected sparse control',pattern:'surface',surfaceDetail:.65,control:'human-rejected'},
  {id:'soft',label:'Soft paired · 35%',pattern:'chroma-soft',surfaceDetail:.35,temporalStability:true},
  {id:'quiet-low',label:'Quiet · 35%',pattern:'quiet',surfaceDetail:.35},
  {id:'quiet-strong',label:'Quiet · 100%',pattern:'quiet',surfaceDetail:1},
  {id:'paired-quiet',label:'Paired · stable · 35%',pattern:'chroma',surfaceDetail:.35,temporalStability:true},
  {id:'dense',label:'Dense scene reference',pattern:'scene',surfaceDetail:.65},
  {id:'original',label:'Flat original · negative control',original:true,control:'negative'},
];
export const QUIET_MOTION_PROFILES=[
  {id:'quiet',label:'Quiet baseline',pattern:'quiet',surfaceDetail:.35},
  {id:'quiet-stable',label:'Quiet with seed history',pattern:'quiet',surfaceDetail:.35,temporalStability:true,gate:'quiet-motion'},
  {id:'original',label:'Flat source negative control',original:true,control:'negative'},
];
export const INK_PROFILES=[
  {id:'quiet',label:'Quiet baseline',pattern:'quiet',surfaceDetail:.35},
  {id:'ink',label:'Dark ink',pattern:'quiet',surfaceDetail:.35,edges:3},
  {id:'original',label:'Flat source negative control',original:true,control:'negative'},
];
export function syntheticFrames({width=640,height=256,spacing=96}={}){
  const frames=[];
  for(let t=0;t<10;t++){
    const shift=t<2?0:Math.min(t-1,5)*3,phase=t<2||t>6?'hold':'move';
    const depth=new Uint8Array(width*height*4),color=new Uint8Array(depth.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      let z=.12,rgb=[58,87,117];
      if(y>height*.62){z=.23+(y/height-.62)*.7;rgb=[139,137,105];}
      if(x>width*.13&&x<width*.3&&y>height*.13&&y<height*.66){z=.43;rgb=[130,151,166];}
      if(Math.hypot(x-width*.76,y-height*.41)<height*.2){z=.62;rgb=[61,116,72];}
      if(Math.abs(x-width*.5-shift)+Math.abs(y-height*.46)<height*.26){z=.86;rgb=[218,183,67];}
      const i=(y*width+x)*4,q=Math.round(z*65535);depth[i]=q>>8;depth[i+1]=q&255;depth[i+3]=255;
      const detail=(x%37<2||y%31<2)?.83:1;color.set([...rgb.map(v=>Math.round(v*detail)),255],i);
    }
    frames.push({width,height,depth,color,origin:'top-left',format:'packed-proximity-rg16',spacing,strength:.5,phase,name:'Layered shapes',frameIndex:t,nominalTimeMs:t*1000/60});
  }
  return frames;
}
export function analyzeBenchmarkFrame(frame,pixels){
  const observed=observeFrame({pixels,width:frame.width,height:frame.height,spacing:frame.spacing,strength:frame.strength},{maxColumns:48,maxRows:28});
  const truth=frame.invertDepth?invertDepthFrame(frame):frame;
  const evaluation=evaluateObserver(observed,truth),fidelity=imageFidelity(pixels,frame.color,frame.width,frame.height,frame.origin??'top-left');
  return {observed,evaluation,fidelity};
}
const average=values=>{const a=values.filter(Number.isFinite);return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;};
function originalPixels(frame){
  const out=new Uint32Array(frame.width*frame.height);
  // Byte views need not be aligned to a 32-bit address.
  const bytes=frame.color.byteOffset%4?frame.color.slice():frame.color;
  const input=new Uint32Array(bytes.buffer,bytes.byteOffset,out.length);
  for(let y=0;y<frame.height;y++)out.set(input.subarray((frame.origin==='bottom-left'?frame.height-1-y:y)*frame.width,(frame.origin==='bottom-left'?frame.height-y:y+1)*frame.width),y*frame.width);return out;
}

export function previewFrameIndices(frameCount, profileCount, frameBytes, budgetBytes) {
  if (![frameCount, profileCount, frameBytes, budgetBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw Error('Invalid preview budget');
  const count=Math.min(frameCount, Math.floor(budgetBytes / profileCount / frameBytes));
  if (!count) throw Error('Preview budget cannot retain one native frame per profile');
  if (count===1) return [0];
  return Array.from({length:count}, (_,i) => Math.round(i*(frameCount-1)/(count-1)));
}

export async function runBenchmark(frames,profiles=PROFILES.slice(0,4),{render=null,analyze=analyzeBenchmarkFrame,onProgress=()=>{},cancelled=()=>false,retainFrames=false,maxPreviewBytes=128*1024*1024}={}){
  if(frames.length<2||!profiles.length)throw Error('Benchmark needs two or more aligned frames and at least one profile');
  const first=frames[0];
  for (const frame of frames) {
    validateDepthFrame(frame);
    validateSceneColor(frame);
    if (frame.format!=='packed-proximity-rg16' || !frame.color || frame.width!==first.width || frame.height!==first.height
      || frame.spacing!==first.spacing || frame.strength!==first.strength || frame.width<16 || frame.height<5
      || (frame.invertDepth??false)!==(first.invertDepth??false) || (frame.invertDepth!==undefined&&typeof frame.invertDepth!=='boolean')
      || !Number.isFinite(frame.spacing) || frame.spacing<8 || frame.spacing>8192
      || !Number.isFinite(frame.strength) || frame.strength<0 || frame.strength>.5) {
      throw Error('Benchmark frames need packed RG16 depth, aligned color and identical dimensions/calibration');
    }
  }
  const constraintAnalysis=analyzeColorConstraints(first.invertDepth?invertDepthFrame(first):first);
  const frameBytes=first.width*first.height*4;
  const retainedIndices=retainFrames?previewFrameIndices(frames.length,profiles.length,frameBytes,maxPreviewBytes):[];
  const keep=new Set(retainedIndices);
  const checkCancelled=()=>{if(cancelled())throw Error('Benchmark cancelled');};
  const results=[],previews=[];
  for(const profile of profiles){
    const cpu=new DepthWalkFilter(),series=[],retained=[],pairs=[],renderTimes=[];
    let previous=null;
    for(let i=0;i<frames.length;i++){
      checkCancelled();
      const frame=frames[i],settings={pattern:profile.pattern,surfaceDetail:profile.surfaceDetail,temporalStability:!!profile.temporalStability,spacing:frame.spacing,depthStrength:frame.strength,dotSize:profile.dotSize??1,edges:profile.edges??2};
      settings.invertDepth=!!frame.invertDepth;
      const start=performance.now(),pixels=profile.original?originalPixels(frame):render?await render(frame,settings,i===0):cpu.render(frame,settings).pixels.slice();renderTimes.push(performance.now()-start);
      checkCancelled();
      const analysis=await analyze(frame,pixels);
      checkCancelled();
      const sample={...analysis,pixels,phase:frame.phase};
      if(previous)pairs.push(compareFramePair(previous,sample,i));
      previous=sample;
      if(keep.has(i))retained.push(sample);
      // All frames contribute metrics; only selected native previews persist.
      series.push({observed:{summary:analysis.observed.summary},evaluation:{summary:analysis.evaluation.summary},fidelity:analysis.fidelity,phase:frame.phase});
      onProgress({profile:profile.label,frame:i+1,frames:frames.length,completed:results.length,total:profiles.length,preview:{frame,pixels,...analysis}});
      await new Promise(r=>setTimeout(r,0));
    }
    const summary=Object.fromEntries(Object.keys(series[0].observed.summary).map(key=>[key,typeof series[0].observed.summary[key]==='boolean'?series[0].observed.summary[key]:average(series.map(s=>s.observed.summary[key]))]));
    const accuracy=average(series.map(s=>s.evaluation.summary.all.within2)),motion=summarizeMotion(pairs),fidelity=average(series.map(s=>s.fidelity?.broadColorRMSE));
    const source=frames[0],edited={...source,color:source.color.slice()},mask=new Uint8Array(source.width*source.height);
    for(let y=Math.floor(source.height*.4);y<Math.floor(source.height*.52);y++)for(let x=Math.floor(source.width*.47);x<Math.floor(source.width*.53);x++){
      mask[y*source.width+x]=1;const row=source.origin==='bottom-left'?source.height-1-y:y;edited.color.set([239,48,173,255],(row*source.width+x)*4);
    }
    const settings={pattern:profile.pattern,surfaceDetail:profile.surfaceDetail,temporalStability:!!profile.temporalStability,spacing:source.spacing,depthStrength:source.strength,dotSize:profile.dotSize??1,edges:profile.edges??2},probeFilter=new DepthWalkFilter();
    settings.invertDepth=!!source.invertDepth;
    checkCancelled();
    const base=profile.original?originalPixels(source):render?await render(source,settings,true):probeFilter.render(source,settings).pixels.slice();
    checkCancelled();
    const changed=profile.original?originalPixels(edited):render?await render(edited,settings,false):probeFilter.render(edited,settings).pixels.slice();
    checkCancelled();
    const colorSpread=measureColorSpread(base,changed,mask,source.width,source.height,source.spacing);
    const findings=diagnose(summary,{all:{within2:accuracy}},motion.summary,colorSpread.summary);
    const result={profile,summary,accuracy,motion:motion.summary,colorSpread:colorSpread.summary,broadColorRMSE:fidelity,renderAndReadbackMs:average(renderTimes),findings,frames:series.map((s,i)=>({index:i,phase:s.phase,observer:s.observed.summary,evaluation:s.evaluation.summary,fidelity:s.fidelity})),timeline:motion.pairs};
    results.push(result);if(retainFrames)previews.push({profile,frames:retained,frameIndices:retainedIndices,colorSpread});
  }
  // Explicit tradeoffs; no invented scalar "comfort" rating. Accuracy and
  // coverage are gates, so a flat original cannot win on RGB resemblance alone.
  const eligible=results.filter(r=>!r.profile.control&&r.accuracy!==null&&r.accuracy>=.9&&r.summary.supportedFraction>=.4&&r.motion.stationaryMaxChangedFraction===0);
  const objectives=r=>[1-r.accuracy,1-r.summary.supportedFraction,r.summary.colorConflictFraction??1,r.motion.truthCorrectedDisparityRMS??Infinity,r.motion.screenLumaRMS??Infinity,r.broadColorRMSE??Infinity,r.colorSpread.remoteFraction];
  const frontier=eligible.filter(a=>!eligible.some(b=>{if(a===b)return false;const x=objectives(a),y=objectives(b);return y.every((v,i)=>v<=x[i])&&y.some((v,i)=>v<x[i]);})).map(r=>r.profile.id);
  const baseline=results.find(r=>r.profile.id==='quiet');
  const decisions=baseline?results.filter(r=>r.profile.gate&&!r.profile.control).map(r=>evaluateCandidate(baseline,r,r.profile.gate)):[];
  return {report:{schema:1,constraintAnalysis,observerVersion:OBSERVER_VERSION,recordedAt:new Date().toISOString(),dataset:first.name,dimensions:[first.width,first.height],spacing:first.spacing,depthStrength:first.strength,frameCount:frames.length,preview:{frameIndices:retainedIndices,nativePixelBytes:retainedIndices.length*profiles.length*frameBytes,budgetBytes:maxPreviewBytes,scope:'Native stereo previews only. Inputs, diagnostic maps and filter workspaces consume additional memory. All frames are analyzed.'},results,frontier,decisions,criteria:{minimumAccuracy:.9,minimumSupport:.4,stationaryDrift:0,scope:'Engineering gates and Pareto tradeoffs, not human comfort acceptance. Diagnostic readback timings are not interactive FPS.'}},previews};
}

