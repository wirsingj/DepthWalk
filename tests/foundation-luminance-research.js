import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {FoundationFilter} from '../src/foundation-stereo.js';

// Measure the presented grayscale image after equivalence-class propagation.
// Whole-image averaging alone can hide opposing regional brightness changes.
// These are code-value measurements, not linear-light or human comfort scores.
export function grayscaleRegions(pixels,width,height,columns=3,rows=3){
  if(!(pixels instanceof Uint32Array)||![width,height,columns,rows].every(v=>Number.isSafeInteger(v)&&v>0)
    ||pixels.length!==width*height||columns>width||rows>height)throw Error('Invalid grayscale region dimensions');
  const sums=new Float64Array(columns*rows),counts=new Uint32Array(sums.length);
  let total=0,squares=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixel=pixels[y*width+x],value=pixel&255;
    if((pixel>>>8&255)!==value||(pixel>>>16&255)!==value)throw Error('Expected grayscale foundation output');
    const region=Math.floor(y*rows/height)*columns+Math.floor(x*columns/width);
    sums[region]+=value;counts[region]++;total+=value;squares+=(value-128)**2;
  }
  return {mean:total/pixels.length,rmsAbout128:Math.sqrt(squares/pixels.length),regions:Array.from(sums,(sum,i)=>sum/counts[i]),columns,rows};
}

export function regionChange(previous,current){
  if(previous.columns!==current.columns||previous.rows!==current.rows)throw Error('Region grids must match');
  const signed=current.regions.map((mean,i)=>mean-previous.regions[i]);
  return {meanDelta:current.mean-previous.mean,absoluteMeanDelta:Math.abs(current.mean-previous.mean),peakRegionDelta:Math.max(...signed.map(Math.abs)),signedRegionDeltas:signed};
}

export function runLuminanceResearch(){
  const width=640,height=360,settings={carrier:'pink',spacing:96,strength:.33},results=[];
  for(const scene of ['flat','two-depth']){
    const depth=Float32Array.from({length:width*height},(_,i)=>scene==='flat'?.5
      :i%width>200&&i%width<430&&Math.floor(i/width)>50&&Math.floor(i/width)<320?.8:.15);
    const filter=new FoundationFilter(),frame={width,height,depth,format:'proximity'};
    const reference=grayscaleRegions(filter.render(frame,settings).pixels,width,height),samples=[];
    for(let noiseFrame=1;noiseFrame<=60;noiseFrame++){
      const stats=grayscaleRegions(filter.render(frame,{...settings,noiseFrame}).pixels,width,height);
      samples.push({noiseFrame,...stats});
    }
    const changes=samples.slice(1).map((sample,i)=>({from:samples[i].noiseFrame,to:sample.noiseFrame,...regionChange(samples[i],sample)}));
    results.push({scene,reference,staticToFirst:regionChange(reference,samples[0]),
      movingMeanRange:[Math.min(...samples.map(s=>s.mean)),Math.max(...samples.map(s=>s.mean))],
      largestWholeImageStep:changes.reduce((a,b)=>a.absoluteMeanDelta>b.absoluteMeanDelta?a:b),
      largestRegionalStep:changes.reduce((a,b)=>a.peakRegionDelta>b.peakRegionDelta?a:b)});
  }
  return {schema:1,scope:'CPU reference, fixed depth, independent procedural pink frames 1–60; whole-image and 3×3 region means in grayscale code values.',
    dimensions:[width,height],settings,interpretation:'Open brightness-pumping diagnostic. No passing perceptual threshold is defined; exact pair equality and per-field RMS do not establish stable presented luminance.',results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(runLuminanceResearch(),null,2));
