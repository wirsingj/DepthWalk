import assert from 'node:assert/strict';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {rootsFor} from './foundation-mechanism.js';
import {createSeedAssignment,appearanceStats} from './foundation-assignment.js';
import {temporalDiagnostics} from './foundation-motion-quality.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';

const width=384,height=128,spacing=72,strength=.33,frames=48,results=[];
const range=values=>({min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,b)=>a+b,0)/values.length});
for(const route of ['unchanged-graph','turn','approach','flat-approach']){
  const depths=Array.from({length:frames},(_,frame)=>Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    if(route==='flat-approach')return .25+frame*.008;
    const sx=route==='turn'?x+frame*2:route==='approach'?(x-width/2)/(1+frame*.014)+width/2:x;
    return sx>110&&sx<275&&y>20&&y<108?.78+(route==='unchanged-graph'?frame*.000001:0):.1;
  }));
  const graphs=depths.map(d=>rootsFor(d,width,height,spacing,strength));
  for(const treatment of ['independent','persistent','overlap-seeds']){
    const filter=new FoundationFilter(),assignment=createSeedAssignment(),images=[],changes=[],appearances=[];
    for(let frame=0;frame<frames;frame++){
      const pixels=treatment==='overlap-seeds'?assignment(graphs[frame],width,height,frame+1).pixels:
        filter.render({depth:depths[frame],width,height,format:'proximity'},
          {carrier:'pink',spacing,strength,noiseFrame:treatment==='persistent'?1:frame+1}).pixels.slice();
      for(let i=0;i<pixels.length;i++)assert.equal(pixels[i],pixels[graphs[frame][i]]);
      appearances.push(appearanceStats(pixels,width,height));
      if(frame){
        const metrics=temporalDiagnostics(images[frame-1],pixels,width,height);
        delete metrics.patches;changes.push({frame,...metrics});
      }
      images.push(pixels);
    }
    if(treatment==='overlap-seeds')assert.deepEqual(assignment(graphs.at(-1),width,height,999).pixels,images.at(-1));
    const worst=changes.reduce((a,b)=>a.frameRmsByte>b.frameRmsByte?a:b).frame;
    const reconstruction=[...new Set([0,worst,frames-1])].map(frame=>{
      const packed=new Uint8Array(width*height*4);
      for(let i=0;i<depths[frame].length;i++){const q=Math.round(depths[frame][i]*65535);packed.set([q>>8,q&255,0,255],i*4);}
      const decoded=reconstructStereogram({pixels:images[frame],width,height,spacing,strength,maxColumns:48,maxRows:24});
      return {frame,...compareReconstruction(decoded,{depth:packed,origin:'top-left'}).summary};
    });
    results.push({route,treatment,exactPairs:true,exactRest:true,
      appearance:Object.fromEntries(['mean','sd','neighborRmsX','neighborRmsY','clippedFraction'].map(key=>[key,range(appearances.map(v=>v[key]))])),
      temporal:Object.fromEntries(['frameRmsByte','changedFraction','columnEnergyCV','reliableFraction','translatedImprovement'].map(key=>{
        const values=changes.map(v=>v[key]).filter(v=>v!==null);return [key,values.length?range(values):null];
      })),worstTransition:changes.find(v=>v.frame===worst),reconstruction});
  }
}
console.log(JSON.stringify({scope:'Offline synthetic depth-only use of existing greedy rank seed ownership; no old RGB mixing. Current pairs/contrast alone do not establish motion comfort. No promotion.',
  width,height,spacing,strength,frames,seed:173,results},null,2));
