import assert from 'node:assert/strict';
import {linkRow} from '../src/stereogram.js';
import {motionTone} from '../src/foundation-motion.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';
import {temporalDiagnostics} from './foundation-motion-quality.js';
import {grayscaleRegions,regionChange} from './foundation-luminance-research.js';

// Offline hypothesis: evolve the source carrier, then assign one current tone
// per current equality class. Never mix rendered frames or retain old depth.
// No publication validates this treatment for SIRDS gameplay. See the scope in
// docs/STEREO-CONSTRAINTS.md. Baseline and persistent controls use the same tones.
const width=384,height=128,spacing=72,strength=.33,frames=48;
const treatments=['independent','continuous-4','continuous-8','persistent'];
const routes=['unchanged-graph','turn','approach','flat-approach'];

function depthFor(route,frame){
  return Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    if(route==='flat-approach')return .25+frame*.008;
    const sx=route==='turn'?x+frame*2:route==='approach'?(x-width/2)/(1+frame*.014)+width/2:x;
    // This control really moves depth, but less than the disparity quantization.
    return sx>110&&sx<275&&y>20&&y<108?.78+(route==='unchanged-graph'?frame*.000001:0):.1;
  });
}

function classes(depth){
  const roots=new Uint32Array(width*height),same=new Int32Array(width);
  for(let y=0;y<height;y++){
    linkRow(depth.subarray(y*width,(y+1)*width),spacing,strength,same,null,null,undefined,null,y);
    for(let x=width-1;x>=0;x--){
      const at=y*width+x;roots[at]=same[x]===x?at:roots[y*width+same[x]];
    }
  }
  return roots;
}

function render(roots,frame,treatment){
  const pixels=new Uint32Array(roots.length);
  const duration=treatment==='continuous-4'?4:8;
  const epoch=Math.floor(frame/duration)+1,phase=frame%duration/duration*Math.PI/2;
  for(let i=pixels.length-1;i>=0;i--){
    const root=roots[i];
    if(root!==i){pixels[i]=pixels[root];continue;}
    const x=i%width,y=Math.floor(i/width);
    let value;
    if(treatment==='independent'||treatment==='persistent')value=motionTone(x,y,'pink',treatment==='persistent'?1:frame+1);
    else value=128+(motionTone(x,y,'pink',epoch)-128)*Math.cos(phase)
      +(motionTone(x,y,'pink',epoch+1)-128)*Math.sin(phase);
    const v=Math.max(0,Math.min(255,Math.round(value)));
    pixels[i]=(0xff000000|v|v<<8|v<<16)>>>0;
  }
  for(let i=0;i<pixels.length;i++)assert.equal(pixels[i],pixels[roots[i]],'current correspondence broken');
  return pixels;
}

function reconstruction(pixels,depth){
  const packed=new Uint8Array(width*height*4);
  for(let i=0;i<depth.length;i++){const q=Math.round(depth[i]*65535);packed[i*4]=q>>8;packed[i*4+1]=q&255;packed[i*4+3]=255;}
  const decoded=reconstructStereogram({pixels,width,height,spacing,strength,maxColumns:48,maxRows:24});
  return {...compareReconstruction(decoded,{depth:packed,origin:'top-left'}).summary,
    reliableFraction:decoded.summary.reliableFraction,weakContrastFraction:decoded.summary.weakContrastFraction};
}

const round=v=>v===null?null:Number(v.toFixed(5));
function range(records,key){
  const values=records.map(v=>v[key]).filter(v=>v!==null);
  return values.length?{mean:round(values.reduce((s,v)=>s+v,0)/values.length),min:round(Math.min(...values)),max:round(Math.max(...values))}:null;
}
const results=[];
let metricSettings;
for(const route of routes){
  const depths=Array.from({length:frames},(_,i)=>depthFor(route,i)),graphs=depths.map(classes);
  if(route==='unchanged-graph')for(const roots of graphs)assert.deepEqual(roots,graphs[0]);
  for(const treatment of treatments){
    const records=[],images=[],toneStats=[];
    for(let frame=0;frame<frames;frame++){
      const pixels=render(graphs[frame],frame,treatment);images.push(pixels);
      const tones=grayscaleRegions(pixels,width,height);
      tones.sd=Math.sqrt(Math.max(0,tones.rmsAbout128**2-(tones.mean-128)**2));toneStats.push(tones);
      if(frame){
        const metrics=temporalDiagnostics(images[frame-1],pixels,width,height);
        // Keep aggregate data; local probes remain available from the shared API.
        metricSettings=metrics.settings;
        delete metrics.patches;delete metrics.settings;delete metrics.scope;
        let changedRoots=0;
        for(let i=0;i<graphs[frame].length;i++)changedRoots+=graphs[frame][i]!==graphs[frame-1][i];
        records.push({frame,...metrics,classChangeFraction:changedRoots/graphs[frame].length,
          peakRegionDelta:regionChange(toneStats[frame-1],tones).peakRegionDelta});
      }
    }
    const last=frames-1;
    assert.deepEqual(render(graphs[last],last,treatment),images[last],'exact rest drifted');
    const worstRms=records.reduce((a,b)=>a.frameRmsByte>b.frameRmsByte?a:b).frame;
    const worstTravel=records.reduce((a,b)=>(a.reliableFraction??0)>(b.reliableFraction??0)?a:b).frame;
    const lowestContrast=toneStats.reduce((best,tones,i)=>tones.sd<toneStats[best].sd?i:best,0);
    const selected=[...new Set([0,last,worstRms,worstTravel,lowestContrast])];
    results.push({route,treatment,exactPairs:true,exactRest:true,
      outputContrastSD:range(toneStats,'sd'),
      temporal:Object.fromEntries(['frameRmsByte','frameMeanAbsByte','changedFraction','frameMeanSignedByte',
        'zeroCorrelation','translatedImprovement','reliableFraction','columnEnergyCV','classChangeFraction','peakRegionDelta'].map(k=>[k,range(records,k)])),
      reconstructed:selected.map(frame=>({frame,...reconstruction(images[frame],depths[frame])})),transitions:records});
  }
}
console.log(JSON.stringify({scope:'Offline synthetic CPU experiment. Not gameplay, display timing or human comfort. No promotion.',
  hypothesis:'Continuous variance-scaled procedural carrier, current-frame class assignment; no rendered-image blending.',
  width,height,spacing,strength,frames,nominalFrameHz:60,seed:173,metricSettings,
  screening:'Compare worst transitions and depth against both independent and persistent controls; no perceptual threshold is claimed.',results},null,2));
