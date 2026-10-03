import {synthesizeFeatures} from './feature-synthesis.js';
import {solveMultiscaleContrast} from './multiscale-contrast.js';
import {invertDepthFrame} from '../depth-direction.js';
import {validateDepthFrame} from '../depth-frame.js';
import {validateSceneColor} from '../scene-color.js';
import {linkRow,separation} from '../stereogram.js';

export const APPEARANCE_PROFILES=[
  {id:'quiet',label:'Quiet baseline',pattern:'quiet',surfaceDetail:.55},
  {id:'rejected-neutral',label:'Neutral ablation - rejected approach',pattern:'neutral-control',surfaceDetail:.55,control:'human-rejected'},
  {id:'projected-raw',label:'Projected color before feature solve',pattern:'solve-projected-raw',surfaceDetail:.55},
  {id:'features',label:'Normalized feature matching',pattern:'solve-features',surfaceDetail:.55},
  {id:'contrast',label:'Local contrast solve',pattern:'solve-contrast',surfaceDetail:.55},
  ...['projected','selective'].map(kind=>({id:kind,label:kind==='projected'?'Projected source solve':'Selective ownership solve',pattern:'solve-'+kind,surfaceDetail:.55})),
  ...[.5,2,8].map(weight=>({id:'solve-'+weight,label:'Appearance solve '+weight,pattern:'solve-'+weight,surfaceDetail:.55})),
];
export const MULTISCALE_PROFILES=[
  {id:'quiet',label:'Quiet baseline',pattern:'quiet',surfaceDetail:.55},
  {id:'single-scale',label:'Single-scale contrast · rejected reference',pattern:'solve-contrast',surfaceDetail:.55,control:'rejected-reference'},
  {id:'multiscale',label:'Multiscale contrast · research',pattern:'solve-multiscale',surfaceDetail:.55,gate:'banding'},
  {id:'original',label:'Flat source negative control',original:true,control:'negative'},
];

export function renderAppearanceFrame(filter,frame,settings){
  if(settings.pattern==='quiet')return filter.render(frame,settings).pixels.slice();
  const color=new Uint8Array(frame.color.length).fill(128);
  for(let i=3;i<color.length;i+=4)color[i]=255;
  const carrier=filter.render({...frame,color},{...settings,pattern:'quiet',edges:0}).pixels.slice();
  if(settings.invertDepth)frame=invertDepthFrame(frame);
  if(settings.pattern==='neutral-control')return carrier;
  const kind=settings.pattern.slice(6);
  if(kind==='features'||kind==='projected-raw'){
    const initial=synthesizeAppearance(frame,carrier,{weight:0,iterations:0,projected:true}).pixels;
    return kind==='features'?synthesizeFeatures(frame,initial).pixels:initial;
  }
  if(kind==='contrast')return synthesizeAppearance(frame,carrier,{weight:2,projected:true,contrast:true,iterations:64}).pixels;
  if(kind==='multiscale')return synthesizeAppearance(frame,carrier,{weight:8,projected:true,multiscale:true,iterations:48}).pixels;
  return synthesizeAppearance(frame,carrier,['projected','selective'].includes(kind)?{weight:2,projected:true,selective:kind==='selective'}:{weight:Number(kind)}).pixels;
}

/** Research-only static synthesis. Solve source fidelity + soft binocular
 * constraints directly, rather than choosing one RGB value per transitive class.
 * Jacobi iterations bound work; this is not a validated human-fusion renderer.
 * Objective: sum |image-target|² + weight * sum_visible |image[L]-image[R]|².
 * target includes a supplied, complete matching carrier; no random frame noise.
 */
export function synthesizeAppearance(frame,carrier,{weight=2,iterations=16,carrierStrength=1,projected=false,selective=false,contrast=false,multiscale=false}={}){
  validateDepthFrame(frame);validateSceneColor(frame);
  const {width,height,depth,color,origin='top-left'}=frame,n=width*height;
  const spacing=frame.spacing??120,strength=frame.strength??.5;
  if(frame.format!=='packed-proximity-rg16'||!color||!(carrier instanceof Uint32Array)||carrier.length!==n
    ||!Number.isFinite(weight)||weight<0||weight>100||!Number.isInteger(iterations)||iterations<0||iterations>128
    ||typeof projected!=='boolean'||typeof selective!=='boolean'||typeof contrast!=='boolean'||typeof multiscale!=='boolean'||(contrast&&multiscale)
    ||!Number.isFinite(carrierStrength)||carrierStrength<0||carrierStrength>2
    ||!Number.isFinite(spacing)||spacing<8||spacing>8192||!Number.isFinite(strength)||strength<0||strength>.5)throw Error('Invalid appearance synthesis inputs');
  const target=new Float32Array(n*3),degree=new Float32Array(n),pairs=[],pairWeights=[];
  const owners=new Int32Array(n).fill(-1),depths=new Float32Array(n);
  const z=new Float32Array(width),same=new Int32Array(width),visible=new Uint8Array(width);
  for(let y=0;y<height;y++){
    const row=(origin==='bottom-left'?height-1-y:y)*width;
    for(let x=0;x<width;x++){
      const i=y*width+x,at=(row+x)*4;
      z[x]=(depth[at]*256+depth[at+1])/65535;depths[i]=z[x];
      const signal=((carrier[i]&255)-128)*carrierStrength;
      for(let c=0;c<3;c++)target[i*3+c]=Math.max(0,Math.min(255,color[at+c]+signal));
    }
    linkRow(z,spacing,strength,same,null,visible);
    for(let x=0;x<width;x++)if(visible[x]){
      const s=separation(z[x],spacing,strength),left=y*width+x-(s>>1),right=left+s;
      pairs.push(left,right);
      for(const endpoint of [left,right])if(owners[endpoint]<0||depths[y*width+x]>=depths[owners[endpoint]])owners[endpoint]=y*width+x;
    }
  }
  if(projected)for(let i=0;i<n;i++){
    const owner=owners[i];if(owner<0)continue;
    const y=Math.floor(owner/width),x=owner%width,at=((origin==='bottom-left'?height-1-y:y)*width+x)*4;
    const signal=((carrier[i]&255)-128)*carrierStrength;
    for(let c=0;c<3;c++)target[i*3+c]=Math.max(0,Math.min(255,color[at+c]+signal));
  }
  let conflicts=0;
  for(let p=0;p<pairs.length;p+=2){
    const a=pairs[p],b=pairs[p+1],oa=owners[a],ob=owners[b];
    const conflict=oa>=0&&ob>=0&&Math.abs(separation(depths[oa],spacing,strength)-separation(depths[ob],spacing,strength))>1;
    const w=selective&&conflict?.05:1;pairWeights.push(w);degree[a]+=w;degree[b]+=w;conflicts+=conflict;
  }
  if(multiscale)return solveMultiscaleContrast(target,pairs,pairWeights,width,weight,iterations,conflicts);
  if(contrast)return solveContrast(target,pairs,pairWeights,width,weight,iterations,conflicts);
  let current=target.slice(),next=new Float32Array(target.length);
  const objective=values=>{
    let source=0,matching=0;
    for(let i=0;i<values.length;i++)source+=(values[i]-target[i])**2;
    for(let p=0;p<pairs.length;p+=2)for(let c=0;c<3;c++)matching+=pairWeights[p/2]*(values[pairs[p]*3+c]-values[pairs[p+1]*3+c])**2;
    return {source,matching,total:source+weight*matching};
  };
  const before=objective(current);
  for(let step=0;step<iterations;step++){
    next.set(target);
    for(let p=0;p<pairs.length;p+=2){
      const a=pairs[p]*3,b=pairs[p+1]*3,w=weight*pairWeights[p/2];
      for(let c=0;c<3;c++){next[a+c]+=w*current[b+c];next[b+c]+=w*current[a+c];}
    }
    for(let i=0;i<n;i++)for(let c=0;c<3;c++)next[i*3+c]/=1+weight*degree[i];
    [current,next]=[next,current];
  }
  const pixels=new Uint32Array(n);
  for(let i=0;i<n;i++)pixels[i]=(0xff000000|Math.round(current[i*3])|Math.round(current[i*3+1])<<8|Math.round(current[i*3+2])<<16)>>>0;
  return {pixels,before,after:objective(current),constraints:pairs.length/2,conflicts,iterations};
}

// Match a local derivative, not absolute RGB: D B I. Constants are in B's
// nullspace, so no equality forces broad surface means through a whole class.
// This is a deliberate linear-model test, not a claim that human matching uses B.
export function solveContrast(target,pairs,weights,width,weight,iterations,conflicts=0){
  const n=target.length/3,indices=new Int32Array(pairs.length*2),degree=new Float32Array(n);
  for(let p=0;p<pairs.length;p+=2){
    const a=pairs[p],b=pairs[p+1],j=p*2;
    indices.set([a,a%width===width-1?a:a+1,b,b%width===width-1?b:b+1],j);
    for(let k=0;k<4;k++)degree[indices[j+k]]+=weights[p/2]*.5;
  }
  let maxDegree=0;for(const d of degree)maxDegree=Math.max(maxDegree,d);
  // ||A||inf <= 2, ||A||1 <= maxDegree; bounds the weighted Hessian.
  const step=.8/(1+weight*2*maxDegree),signs=[-.5,.5,.5,-.5];
  const current=Float64Array.from(target),gradient=new Float64Array(target.length);
  const measure=()=>{
    let source=0,matching=0;
    for(let i=0;i<current.length;i++)source+=(current[i]-target[i])**2;
    for(let j=0;j<indices.length;j+=4)for(let c=0;c<3;c++){
      let delta=0;for(let k=0;k<4;k++)delta+=signs[k]*current[indices[j+k]*3+c];
      matching+=weights[j/4]*delta*delta;
    }
    return {source,matching,total:source+weight*matching};
  };
  const before=measure();
  for(let t=0;t<iterations;t++){
    for(let i=0;i<current.length;i++)gradient[i]=current[i]-target[i];
    for(let j=0;j<indices.length;j+=4)for(let c=0;c<3;c++){
      let delta=0;for(let k=0;k<4;k++)delta+=signs[k]*current[indices[j+k]*3+c];
      for(let k=0;k<4;k++)gradient[indices[j+k]*3+c]+=weight*weights[j/4]*signs[k]*delta;
    }
    for(let i=0;i<current.length;i++)current[i]=Math.max(0,Math.min(255,current[i]-step*gradient[i]));
  }
  const pixels=new Uint32Array(n);
  for(let i=0;i<n;i++)pixels[i]=(0xff000000|Math.round(current[i*3])|Math.round(current[i*3+1])<<8|Math.round(current[i*3+2])<<16)>>>0;
  return {pixels,before,after:measure(),constraints:pairs.length/2,conflicts,iterations,matchingDomain:'local horizontal contrast'};
}
