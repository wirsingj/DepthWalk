import assert from 'node:assert/strict';
import {linkRow} from '../src/stereogram.js';
import {motionTone} from '../src/foundation-motion.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';

// Offline hypothesis, never a gameplay mode: retain a carrier epoch only when
// every member of the current stereo class is unchanged. No old image is mixed.
// Dynamic-pattern motivation: Tyler, Scholarpedia, Autostereogram (2014).
// Exact-class reuse is our proposal, not a result established by that source.
const width=384,height=128,spacing=72,strength=.33,frames=12;
function render(depth,epoch,previous=null){
  const roots=new Uint32Array(width*height),counts=new Uint16Array(roots.length);
  const epochs=new Uint32Array(roots.length),changed=new Uint8Array(roots.length);
  const pixels=new Uint32Array(roots.length),same=new Int32Array(width);
  for(let y=0;y<height;y++){
    linkRow(depth.subarray(y*width,(y+1)*width),spacing,strength,same,null,null,undefined,null,y);
    for(let x=width-1;x>=0;x--){
      const at=y*width+x,root=same[x]===x?at:roots[y*width+same[x]];
      roots[at]=root;counts[root]++;
      if(!previous||previous.roots[at]!==root)changed[root]=1;
    }
  }
  let reused=0;
  for(let i=roots.length-1;i>=0;i--){
    const root=roots[i];
    if(i===root){
      const stable=previous&&!changed[root]&&counts[root]===previous.counts[root];
      epochs[root]=stable?previous.epochs[root]:epoch;
      if(stable)reused+=counts[root];
      const value=motionTone(i%width,Math.floor(i/width),'pink',epochs[root]);
      pixels[i]=(0xff000000|value|value<<8|value<<16)>>>0;
    }else pixels[i]=pixels[root];
  }
  for(let i=0;i<pixels.length;i++)assert.equal(pixels[i],pixels[roots[i]]);
  return {pixels,roots,counts,epochs,reused:reused/pixels.length};
}
function difference(a,b){
  let sum=0;const columns=new Float64Array(width/8);
  for(let i=0;i<a.length;i++){
    const d=((a[i]&255)-(b[i]&255))**2;sum+=d;columns[Math.floor(i%width/8)]+=d;
  }
  const rms=Math.sqrt(sum/a.length),mean=sum/columns.length;
  const stripeVariation=mean?Math.sqrt(columns.reduce((s,v)=>s+(v-mean)**2,0)/columns.length)/mean:0;
  return {rms,stripeVariation};
}
function depthFor(route,frame){
  return Float64Array.from({length:width*height},(_,i)=>{
    const x=i%width,y=Math.floor(i/width);
    if(route==='flat-approach')return .5+frame*.008;
    const sx=route==='turn'?x+frame*2:(x-width/2)/(1+frame*.014)+width/2;
    return sx>110&&sx<275&&y>20&&y<108?.78:.1+.2*sx/width;
  });
}
const rounded=v=>Number(v.toFixed(5));
const results=[];
for(const route of ['turn','approach','flat-approach']){
  let previous,reused,totalReuse=0;const baselineChanges=[],reuseChanges=[];
  for(let frame=1;frame<=frames;frame++){
    const depth=depthFor(route,frame),baseline=render(depth,frame),candidate=render(depth,frame,reused);
    assert.deepEqual(candidate.roots,baseline.roots);
    if(previous){baselineChanges.push(difference(previous.pixels,baseline.pixels));reuseChanges.push(difference(reused.pixels,candidate.pixels));}
    assert.deepEqual(render(depth,frame+1,candidate).pixels,candidate.pixels,'unchanged graph refreshed');
    totalReuse+=candidate.reused;previous=baseline;reused=candidate;
  }
  const stats=changes=>{
    const averageRms=changes.reduce((s,c)=>s+c.rms,0)/changes.length;
    return {averageRms:rounded(averageRms),peakRms:rounded(Math.max(...changes.map(c=>c.rms))),peakStripeVariation:rounded(Math.max(...changes.map(c=>c.stripeVariation))),quietTransitions:changes.filter(c=>c.rms<1).length};
  };
  const depth=depthFor(route,frames),packed=new Uint8Array(width*height*4);
  for(let i=0;i<depth.length;i++){const q=Math.round(depth[i]*65535);packed[i*4]=q>>8;packed[i*4+1]=q&255;packed[i*4+3]=255;}
  const decoded=[previous,reused].map(f=>compareReconstruction(reconstructStereogram({pixels:f.pixels,width,height,spacing,strength,maxColumns:48,maxRows:24}),{depth:packed,origin:'top-left'}).summary.withinTwoPixels);
  results.push({route,reusedFraction:rounded(totalReuse/frames),baseline:stats(baselineChanges),reuse:stats(reuseChanges),decodedDepthWithinTwoPixels:decoded.map(rounded)});
}
console.log(JSON.stringify({scope:'Synthetic exact-class reuse; no human comfort claim or game integration',width,height,spacing,strength,frames,results},null,2));
