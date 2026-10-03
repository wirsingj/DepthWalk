// Image-only diagnostics. No imports from the renderer, scene or stereo encoder.
// These are engineering indicators, not a calibrated model of human stereopsis.
import {reconstructStereogram} from './reconstruct.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const linear=Float64Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
export const OBSERVER_VERSION='observer-1.1';
export function luminanceImage(pixels){return Float32Array.from(pixels,c=>.2126*linear[c&255]+.7152*linear[c>>>8&255]+.0722*linear[c>>>16&255]);}

function validateImage({pixels, width, height, spacing=120, strength=.5}) {
  if (!(pixels instanceof Uint32Array) || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 16 || height < 5 || pixels.length !== width * height
    || !Number.isFinite(spacing) || spacing < 8 || spacing > 8192
    || !Number.isFinite(strength) || strength < 0 || strength > .5) {
    throw Error('Invalid observer image');
  }
}

function patch(gray,width,height,l,r,y,rx=3,ry=1){
  if(l-r===0||Math.min(l,r)<rx||Math.max(l,r)>=width-rx||y<ry||y>=height-ry)return null;
  let a=0,b=0,aa=0,bb=0,ab=0,delta=0,n=0;
  for(let dy=-ry;dy<=ry;dy++)for(let dx=-rx;dx<=rx;dx++){
    const A=gray[(y+dy)*width+l+dx],B=gray[(y+dy)*width+r+dx];a+=A;b+=B;aa+=A*A;bb+=B*B;ab+=A*B;delta+=(A-B)**2;n++;
  }
  const va=Math.max(0,aa-a*a/n),vb=Math.max(0,bb-b*b/n),contrast=Math.sqrt((va+vb)/(2*n));
  if(va/n<.000025||vb/n<.000025)return null;
  return {cost:(1-Math.max(-1,Math.min(1,(ab-a*b/n)/Math.sqrt(va*vb))))/2,contrast,residual:Math.sqrt(delta/n)};
}
function bestAtAnchor(gray,w,h,x,y,min,max,direction){
  let shift=NaN,cost=Infinity;
  for(let s=min;s<=max;s++){const p=patch(gray,w,h,x,x+direction*s,y);if(p&&p.cost<cost){cost=p.cost;shift=s;}}
  return shift;
}
function minima(costs,min,max){
  const sorted=[];
  for(let s=min;s<=max;s++)if(Number.isFinite(costs[s]))sorted.push({disparity:s,cost:costs[s]});
  sorted.sort((a,b)=>a.cost-b.cost||a.disparity-b.disparity);
  const peaks=[];for(const p of sorted)if(peaks.every(q=>Math.abs(q.disparity-p.disparity)>2)){peaks.push(p);if(peaks.length===6)break;}
  return peaks;
}
export function inspectPixel(image,x,y,gray=luminanceImage(image.pixels)){
  validateImage(image);
  if (!Number.isFinite(x) || !Number.isFinite(y) || gray.length !== image.pixels.length) throw Error('Invalid observer probe');
  const {width:w,height:h,spacing=120,strength=.5,pixels}=image;
  x=Math.round(x);y=Math.round(y);
  const min=Math.round(2*spacing*(1-strength)/(2-strength)),max=Math.round(spacing),lo=Math.max(4,Math.floor(spacing*.45)),hi=Math.min(w-8,Math.ceil(spacing*2.25));
  const fine=new Float32Array(hi+1).fill(NaN),broad=fine.slice();
  for(let s=lo;s<=hi;s++){
    const l=x-(s>>1),r=l+s,a=patch(gray,w,h,l,r,y),b=patch(gray,w,h,l,r,y,7,2);
    if(a)fine[s]=a.cost;if(b)broad[s]=b.cost;
  }
  const peaks=minima(fine,min,max),large=minima(broad,min,max),all=minima(fine,lo,hi),first=peaks[0];
  if(!first)return {x,y,min,max,lo,hi,fine,broad,peaks,all,valid:false};
  const s=first.disparity,l=x-(s>>1),r=l+s,p=patch(gray,w,h,l,r,y),second=peaks[1]?.cost??1;
  const forward=bestAtAnchor(gray,w,h,l,y,min,max,1),reverse=bestAtAnchor(gray,w,h,r,y,min,max,-1);
  const roundTrip=Number.isFinite(forward)&&Number.isFinite(reverse)?Math.max(Math.abs(forward-s),Math.abs(reverse-s)):Infinity;
  const scaleDifference=large.length?Math.abs(large[0].disparity-s):Infinity;
  const confidence=clamp((second-first.cost)/.12)*clamp((.22-first.cost)/.2)*clamp(p.contrast/.09);
  let left=[0,0,0],right=[0,0,0],n=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-3;dx<=3;dx++){
    const A=pixels[(y+dy)*w+l+dx],B=pixels[(y+dy)*w+r+dx];
    for(let c=0;c<3;c++){left[c]+=linear[A>>>(8*c)&255];right[c]+=linear[B>>>(8*c)&255];}n++;
  }
  left=left.map(v=>v/n);right=right.map(v=>v/n);
  const sa=Math.max(.001,left.reduce((a,b)=>a+b,0)),sb=Math.max(.001,right.reduce((a,b)=>a+b,0));
  const chromaDifference=left.reduce((sum,v,c)=>sum+Math.abs(v/sa-right[c]/sb),0)/2;
  const alternatives=all.filter(v=>Math.abs(v.disparity-s)>2).map(v=>({...v,harmonic:Math.abs(v.disparity-s*Math.round(v.disparity/s))<=2&&v.disparity>s}));
  return {x,y,min,max,lo,hi,fine,broad,peaks,all,valid:true,disparity:s,confidence,cost:first.cost,contrast:p.contrast,lumaResidual:p.residual,roundTrip,scaleDifference,chromaDifference,left,right,alternatives};
}
function holes(mask,w,h,step){
  const seen=new Uint8Array(mask.length),regions=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
    const queue=[i];seen[i]=1;let x0=w,y0=h,x1=0,y1=0;
    for(let q=0;q<queue.length;q++){
      const at=queue[q],x=at%w,y=Math.floor(at/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const n of [x?at-1:-1,x<w-1?at+1:-1,y?at-w:-1,y<h-1?at+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}
    }
    regions.push({samples:queue.length,bounds:[x0*step,y0*step,(x1-x0+1)*step,(y1-y0+1)*step]});
  }
  return regions.sort((a,b)=>b.samples-a.samples).slice(0,5);
}
export function observeFrame(image,{maxColumns=64,maxRows=40}={}){
  const {pixels,width,height,spacing=120,strength=.5}=image;
  validateImage(image);
  if (![maxColumns, maxRows].every(n => Number.isInteger(n) && n > 0)) throw Error('Observer grid dimensions must be positive integers');
  const gray=luminanceImage(pixels),step=Math.max(1,Math.ceil(width/maxColumns),Math.ceil(height/maxRows)),columns=Math.ceil(width/step),rows=Math.ceil(height/step),n=columns*rows;
  const disparity=new Float32Array(n).fill(NaN),confidence=new Float32Array(n),chroma=new Float32Array(n).fill(NaN),rivalry=new Float32Array(n).fill(NaN),scaleDisagreement=new Float32Array(n).fill(NaN),weak=new Uint8Array(n),left=new Uint32Array(n),right=new Uint32Array(n),fused=new Uint32Array(n);
  let eligible=0,valid=0,supported=0,colorPairs=0,conflicts=0,inconsistent=0,multiscale=0,ambiguous=0,harmonics=0,nonharmonics=0,luma=0,contrast=0;
  const encode=c=>{let v=0xff000000;for(let k=0;k<3;k++){const x=clamp(c[k]),s=x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;v|=Math.round(s*255)<<(8*k);}return v>>>0;};
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<columns;gx++){
    const x=Math.min(width-1,Math.floor((gx+.5)*step)),y=Math.min(height-1,Math.floor((gy+.5)*step)),i=gy*columns+gx;
    if(x<spacing/2+8||x>=width-spacing/2-8||y<3||y>=height-3)continue;
    eligible++;const p=inspectPixel(image,x,y,gray);weak[i]=1;if(!p.valid)continue;
    valid++;disparity[i]=p.disparity;confidence[i]=p.confidence;chroma[i]=p.chromaDifference;rivalry[i]=Math.min(1,p.roundTrip/4);scaleDisagreement[i]=Math.min(1,p.scaleDifference/4);
    left[i]=encode(p.left);right[i]=encode(p.right);fused[i]=encode(p.left.map((v,c)=>(v+p.right[c])/2));
    const good=p.confidence>.35&&p.roundTrip<=1&&p.scaleDifference<=2;
    supported+=good;weak[i]=!good;inconsistent+=p.roundTrip>1;multiscale+=p.scaleDifference>2;
    if(p.cost<.22){colorPairs++;conflicts+=p.chromaDifference>.075;}
    ambiguous+=p.peaks.length>1&&p.peaks[1].cost-p.cost<.06&&p.cost<.22;
    harmonics+=p.alternatives.some(a=>a.harmonic&&a.cost-p.cost<.06&&a.cost<.22);
    nonharmonics+=p.alternatives.some(a=>!a.harmonic&&(a.disparity<p.min||a.disparity>p.max)&&a.cost-p.cost<.06&&a.cost<.22);
    luma+=p.lumaResidual;contrast+=p.contrast;
  }
  const regions=holes(weak,columns,rows,step),divide=(a,b)=>b?a/b:null;
  return {width,height,columns,rows,step,spacing,strength,disparity,confidence,chroma,rivalry,scaleDisagreement,left,right,fused,regions,
    summary:{eligible,valid,coverage:divide(valid,eligible),supportedFraction:divide(supported,eligible),colorConflictFraction:divide(conflicts,colorPairs),colorPairs,roundTripFailureFraction:divide(inconsistent,valid),scaleDisagreementFraction:divide(multiscale,valid),ambiguousFraction:divide(ambiguous,valid),harmonicAlternativeFraction:divide(harmonics,valid),nonharmonicAlternativeFraction:divide(nonharmonics,valid),meanLumaResidual:divide(luma,valid),meanContrast:divide(contrast,valid),largestUnsupportedRegion:divide(regions[0]?.samples??0,eligible),zeroStrength:strength===0}};
}

// Truth is confined to evaluation, after image-only estimates are complete.
export function evaluateObserver(observed,{depth,origin='top-left'}){
  const {width,height,columns,rows,step,spacing,strength,disparity}=observed;
  if(!(depth instanceof Uint8Array)||depth.length!==width*height*4)throw Error('Observer comparison needs packed RG16 depth');
  if (!['top-left', 'bottom-left'].includes(origin)) throw Error('Invalid observer depth origin');
  const errors=new Float32Array(disparity.length).fill(NaN),expected=new Float32Array(disparity.length),edge=new Uint8Array(disparity.length),all=[],edges=[],interiors=[];
  const z=(x,y)=>{const at=((origin==='bottom-left'?height-1-y:y)*width+x)*4;return(depth[at]*256+depth[at+1])/65535;};
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<columns;gx++){
    const i=gy*columns+gx,x=Math.min(width-1,Math.floor((gx+.5)*step)),y=Math.min(height-1,Math.floor((gy+.5)*step)),q=z(x,y);
    expected[i]=Math.round(2*spacing*(1-strength*q)/(2-strength*q));
    edge[i]=Math.max(Math.abs(q-z(Math.max(0,x-4),y)),Math.abs(q-z(Math.min(width-1,x+4),y)),Math.abs(q-z(x,Math.max(0,y-4))),Math.abs(q-z(x,Math.min(height-1,y+4))))>.025;
    if(!Number.isFinite(disparity[i]))continue;const e=errors[i]=disparity[i]-expected[i];all.push(Math.abs(e));(edge[i]?edges:interiors).push(Math.abs(e));
  }
  const stats=a=>{a.sort((a,b)=>a-b);return{samples:a.length,within2:a.length?a.filter(v=>v<=2).length/a.length:null,mean:mean(a),p95:a.length?a[Math.floor((a.length-1)*.95)]:null};};
  return {errors,expected,edge,summary:{all:stats(all),boundaries:stats(edges),interiors:stats(interiors)}};
}
export function compareFramePair(a, b, to=1) {
    if(a.pixels.length!==b.pixels.length||a.observed.step!==b.observed.step||a.observed.width!==b.observed.width||a.observed.height!==b.observed.height)throw Error('Sequence layouts must match');
    let squared=0,changed=0;
    for(let i=0;i<a.pixels.length;i++){
      const A=a.pixels[i],B=b.pixels[i];
      // Preserve Float32 rounding from luminanceImage without two full images.
      const la=Math.fround(.2126*linear[A&255]+.7152*linear[A>>>8&255]+.0722*linear[A>>>16&255]);
      const lb=Math.fround(.2126*linear[B&255]+.7152*linear[B>>>8&255]+.0722*linear[B>>>16&255]);
      squared+=(la-lb)**2;changed+=A!==B;
    }
    let loss=0,previousSupported=0,jitter=0,count=0;
    for(let i=0;i<b.observed.disparity.length;i++){
      const ca=a.observed.confidence[i]>.35,cb=b.observed.confidence[i]>.35;
      previousSupported+=ca;loss+=ca&&!cb;
      const ea=a.evaluation?.errors[i],eb=b.evaluation?.errors[i];
      if(Number.isFinite(ea)&&Number.isFinite(eb)){jitter+=(eb-ea)**2;count++;}
    }
    return {from:to-1,to,phase:b.phase,screenLumaRMS:Math.sqrt(squared/a.pixels.length),changedPixelFraction:changed/a.pixels.length,correspondenceLoss:previousSupported?loss/previousSupported:null,truthCorrectedDisparityRMS:count?Math.sqrt(jitter/count):null,stationary:b.phase==='hold'&&a.phase==='hold'};
}
export function summarizeMotion(pairs) {
  const avg=key=>mean(pairs.map(p=>p[key]).filter(v=>v!==null));
  return {pairs,summary:{screenLumaRMS:avg('screenLumaRMS'),correspondenceLoss:avg('correspondenceLoss'),truthCorrectedDisparityRMS:avg('truthCorrectedDisparityRMS'),stationaryMaxChangedFraction:Math.max(0,...pairs.filter(p=>p.stationary).map(p=>p.changedPixelFraction)),scope:'Screen changes include intended motion. Disparity jitter subtracts the change in intended disparity at each screen sample; this is not world-space optical flow.'}};
}
export function compareSequence(frames) {
  return summarizeMotion(frames.slice(1).map((b, i) => compareFramePair(frames[i], b, i+1)));
}
// Counterfactual evaluation: this mask is a SOURCE color edit, not decoder input.
// A generous 1.5-period envelope includes both eye projections and one partner
// rejection. Change beyond it exposes long-range chroma propagation.
export function measureColorSpread(before,after,mask,width,height,spacing){
  if(before.length!==width*height||after.length!==before.length||mask.length!==before.length)throw Error('Color probe layouts must match');
  if (!Number.isFinite(spacing) || spacing <= 0) throw Error('Color probe spacing must be positive');
  const map=new Float32Array(before.length);let affected=0,remote=0,farthest=0;
  const distances=new Float64Array(width);
  for(let y=0;y<height;y++){
    // Nearest edit on either side in two linear passes. An empty row retains
    // Infinity, so cross-row color changes still count as remote propagation.
    let nearest=-Infinity;
    for(let x=0;x<width;x++){if(mask[y*width+x])nearest=x;distances[x]=x-nearest;}
    nearest=Infinity;
    for(let x=width-1;x>=0;x--){if(mask[y*width+x])nearest=x;distances[x]=Math.min(distances[x],nearest-x);}
    for(let x=0;x<width;x++){
      const i=y*width+x,A=before[i],B=after[i];
      if(A===B)continue;
      const ar=linear[A&255],ag=linear[A>>>8&255],ab=linear[A>>>16&255],as=Math.max(.001,ar+ag+ab);
      const br=linear[B&255],bg=linear[B>>>8&255],bb=linear[B>>>16&255],bs=Math.max(.001,br+bg+bb);
      const delta=(Math.abs(ar/as-br/bs)+Math.abs(ag/as-bg/bs)+Math.abs(ab/as-bb/bs))/2;
      if(delta<=.025)continue;
      const distance=distances[x];
      affected++;remote+=distance>1.5*spacing;map[i]=distance>1.5*spacing?1:.35;farthest=Math.max(farthest,distance);
    }
  }
  return {map,summary:{affected,remote,remoteFraction:affected?remote/affected:0,farthestPixels:Number.isFinite(farthest)?farthest:null,envelopePixels:spacing*1.5,threshold:.025,scope:'Response to a local source-color intervention with identical depth, not a perceptual ghost score.'}};
}
export function diagnose(summary,evaluation=null,motion=null,colorSpread=null){
  const findings=[];
  const add=(severity,code,message)=>findings.push({severity,code,message});
  if(summary.zeroStrength)add('unknown','zero-strength','No depth variation is identifiable at zero strength.');
  if(summary.supportedFraction===null||summary.supportedFraction<.55)add('warning','weak-support','Large areas lack consistent, distinctive matching evidence. Inspect the unsupported-region map.');
  if(summary.colorConflictFraction>.12)add('warning','color-conflict','Corresponding eye patches disagree in chromaticity; doubled or rival colors are a risk.');
  if(summary.roundTripFailureFraction>.15)add('warning','inconsistent-pairs','Left/right anchored searches disagree. Inspect boundaries and competing matches.');
  if(summary.scaleDisagreementFraction>.18)add('warning','scale-disagreement','Small and large neighborhoods prefer different depths.');
  if(summary.ambiguousFraction>.1)add('warning','competing-depths','Multiple depths inside the calibrated range have similar evidence.');
  if(summary.nonharmonicAlternativeFraction>.15)add('warning','alternate-depths','Strong nonharmonic matches exist outside the calibrated depth range.');
  if(evaluation?.all.within2!==null&&evaluation?.all.within2<.9)add('fail','wrong-depth','More than 10% of decoded samples miss intended disparity by over two pixels.');
  if(motion?.stationaryMaxChangedFraction>0)add('fail','stationary-drift','Identical held poses produce different pixels.');
  if(motion?.truthCorrectedDisparityRMS>2)add('warning','unstable-depth','Decoded depth changes exceed the intended changes by over two pixels RMS.');
  if(colorSpread?.remoteFraction>.15)add('warning','color-spread','A local source-color edit propagates well beyond its stereo-pair neighborhood.');
  if(!findings.length)add('info','no-flags','No configured engineering threshold was crossed. Human comfort remains unmeasured.');
  return findings;
}
export {reconstructStereogram};
