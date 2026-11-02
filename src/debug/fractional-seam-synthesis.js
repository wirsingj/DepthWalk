// Research-only finite-basis projection. Fit seed coefficients to continuity
// constraints before sampling; never average rendered images or alter geometry.
import {createFractionalEdgeField,edgeDefaults} from './fractional-synthesis.js';
const TAU=2*Math.PI;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);

function basis(x,kind,spectrum,derivative=0,independentSeeds=false){
  const out=new Float64Array(independentSeeds?48:24),offset=independentSeeds?kind*24:0;
  for(let k=0;k<12;k++){
    const frequency=TAU*(k+1)/spectrum.period;
    const phase=frequency*(x-spectrum.origin)+kind*(k+1)*spectrum.birthPhase;
    out[offset+2*k]=frequency**derivative*Math.cos(phase+derivative*Math.PI/2);
    out[offset+2*k+1]=frequency**derivative*Math.sin(phase+derivative*Math.PI/2);
  }
  return out;
}

function orthogonalRows(constraints){
  const rows=[];
  for(const original of constraints){
    const v=Float64Array.from(original),size=Math.sqrt(dot(v,v));
    if(size<1e-9)continue;
    // Two-pass modified Gram-Schmidt handles repeated propagated seams.
    for(let pass=0;pass<2;pass++)for(const q of rows){
      const component=dot(v,q);for(let i=0;i<v.length;i++)v[i]-=component*q[i];
    }
    const norm=Math.sqrt(dot(v,v));
    if(norm<=size*1e-9)continue;
    rows.push(v.map(value=>value/norm));
  }
  return rows;
}

export function createSeamMatchedField(options={}, {continuity='value',independentSeeds=false,fadePixels=0}={}){
  if(!['value','slope'].includes(continuity)||typeof independentSeeds!=='boolean'||
    !Number.isFinite(fadePixels)||fadePixels<0||fadePixels>32)throw Error('Invalid seam continuity');
  const g={...edgeDefaults,...options},base=createFractionalEdgeField(options),spectrum=base.spectrum,parts=base.partition();
  const constraints=[];
  for(let i=1;i<parts.length;i++){
    for(let derivative=0;derivative<=(continuity==='slope'?1:0);derivative++){
      const left=basis(parts[i-1].rootEnd,parts[i-1].kind,spectrum,derivative,independentSeeds),right=basis(parts[i].rootStart,parts[i].kind,spectrum,derivative,independentSeeds);
      constraints.push(left.map((v,j)=>v-right[j]));
    }
  }
  const rows=orthogonalRows(constraints);
  const scale=1-g.nearSeparation/g.eyeSeparation,origin=(g.width-1)/2;
  const visibleWidth=sign=>{
    const a=origin+g.foregroundLeft*scale+sign*g.nearSeparation/2;
    const b=origin+g.foregroundRight*scale+sign*g.nearSeparation/2;
    return Math.max(0,Math.min(g.width-.5,b)-Math.max(-.5,a));
  };
  const supportWidth=Math.max(visibleWidth(-1),visibleWidth(1));
  const t=fadePixels?Math.min(1,supportWidth/fadePixels):1,amount=t*t*(3-2*t);
  const originals=spectrum.rows.map(v=>independentSeeds?Float64Array.from([...v,...v]):v);
  const coefficients=originals.map(original=>{
    const result=Float64Array.from(original);
    for(const q of rows){const component=amount*dot(original,q);for(let i=0;i<result.length;i++)result[i]-=component*q[i];}
    return result;
  });
  const sample=(x,y)=>{
    if(!Number.isFinite(x)||x<-.5||x>g.width-.5||!Number.isInteger(y)||y<0||y>=g.height)throw Error('Invalid seam field sample');
    const part=parts.find(p=>x<p.end)??parts.at(-1),root=part.rootStart+x-part.start;
    return 128+dot(coefficients[y],basis(root,part.kind,spectrum,0,independentSeeds));
  };
  const area=(center,y)=>{
    if(!Number.isFinite(center)||center<0||center>g.width-1||!Number.isInteger(y)||y<0||y>=g.height)throw Error('Invalid seam area sample');
    let result=0;
    for(const part of parts){
      const lo=Math.max(center-.5,part.start),hi=Math.min(center+.5,part.end);
      if(hi<=lo)continue;
      const a=part.rootStart+lo-part.start,b=part.rootStart+hi-part.start;
      result+=128*(hi-lo);
      const offset=independentSeeds?part.kind*24:0;
      for(let k=0;k<12;k++){
        const frequency=TAU*(k+1)/spectrum.period,phase=part.kind*(k+1)*spectrum.birthPhase-frequency*spectrum.origin;
        result+=coefficients[y][offset+2*k]*(Math.sin(frequency*b+phase)-Math.sin(frequency*a+phase))/frequency;
        result+=coefficients[y][offset+2*k+1]*(Math.cos(frequency*a+phase)-Math.cos(frequency*b+phase))/frequency;
      }
    }
    return result;
  };
  const render=({quantize=true}={})=>{
    if(typeof quantize!=='boolean')throw Error('Invalid quantization flag');
    const pixels=Float64Array.from({length:g.width*g.height},(_,i)=>area(i%g.width,Math.floor(i/g.width)));
    if(pixels.some(v=>!Number.isFinite(v)||v<0||v>255))throw Error('Seam candidate exceeds display gamut');
    return {width:g.width,height:g.height,pixels:quantize?Uint8Array.from(pixels,Math.round):pixels};
  };
  // Avoid an argument-list overflow at supported large row counts.
  let residual=0;
  for(const c of coefficients)for(const row of constraints)residual=Math.max(residual,Math.abs(dot(c,row)));
  return {sample,area,render,partition:base.partition,diagnostics:{continuity,independentSeeds,fadePixels,supportWidth,projectionAmount:amount,
    rank:rows.length,dimensions:independentSeeds?48:24,maxConstraintResidual:residual,
    coefficientEnergyRetention:coefficients.map((c,i)=>dot(c,c)/dot(originals[i],originals[i]))}};
}
