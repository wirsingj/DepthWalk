import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separation, createWorkspace, encodeFrame, linkRow } from '../src/stereogram.js';
import { createSeedField, MATERIAL_PALETTE } from '../src/pattern.js';
import { SURFACE, SURFACE_COUNT } from '../src/surfaces.js';
import {contrast,correlation,ringDepth} from './stereo-quality.js';

function frame(w,h,z) {
  const input=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=Math.round(z(x,y)*65535),i=((h-1-y)*w+x)*4;
    input[i]=v>>8;input[i+1]=v&255;input[i+3]=255;
  }
  return input;
}
function encode(w,h,z,spacing=84,strength=.32){return encodeFrame(frame(w,h,z),w,h,spacing,strength,createWorkspace(w),createSeedField(w,h,1),new Uint32Array(w*h));}
function matchRate(pixels,w,h,offset,x0=0,x1=w-offset){
  let match=0,n=0;
  for(let y=0;y<h;y++)for(let x=x0;x<x1;x++){match+=pixels[y*w+x]===pixels[y*w+x+offset];n++;}
  return match/n;
}
test('parallel viewing: near surfaces have smaller disparity than far surfaces',()=>{
  assert.equal(separation(0,84,.32),84);
  assert.equal(separation(1,84,.32),68);
  let prev=84;
  for(let z=0;z<=1;z+=.01){const s=separation(z,84,.32);assert.ok(s<=prev);prev=s;}
});
test('canonical depth gives deterministic round-half-up pixel separation',()=>{
  const q=15420,ideal=q/65535,stored=Math.fround(ideal);
  assert.equal(separation(ideal,120,.5),113);
  assert.equal(separation(stored,120,.5),113,'Float32 storage must not change a half-pixel decision');
  assert.equal(separation((q+1)/65535,120,.5),112);
  assert.equal(separation((q-1)/65535,120,.5),113);
});
test('flat depth creates exact binocular correspondences at its predicted spacing',()=>{
  for(const z of [0,.3,.7,1]){
    const s=separation(z,84,.32),out=encode(800,24,()=>z);
    assert.equal(matchRate(out,800,24,s),1,`depth ${z}`);
    assert.ok(matchRate(out,800,24,s+5)<.45,'not a uniform image or arbitrary repetition');
  }
});
test('foreground slab and background encode distinct measurable disparities',()=>{
  const w=1000,h=30,out=encode(w,h,x=>x>=350&&x<650?.9:.1);
  const near=separation(.9,84,.32),far=separation(.1,84,.32);
  assert.equal(matchRate(out,w,h,near,400,550),1);
  assert.equal(matchRate(out,w,h,far,80,230),1);
  assert.ok(matchRate(out,w,h,far,400,550)<.5);
});
test('overlap edges reject hidden eye-ray constraints',()=>{
  const z=Float32Array.from({length:800},(_,x)=>x>=300&&x<500?.95:.05);
  const stats={occluded:0,visible:0};
  const same=linkRow(z,84,.4,new Int32Array(800),stats);
  assert.ok(stats.occluded>10);
  assert.ok(stats.visible>600);
  for(let x=0;x<800;x++)assert.ok(same[x]>=x&&same[x]<800,'acyclic rightward links');
});
test('zero depth strength is a uniform repeated texture regardless of geometry',()=>{
  const out=encode(800,24,x=>(x%71)/70,84,0);
  assert.equal(matchRate(out,800,24,84),1);
});
test('identical depth frames are byte-identical over time',()=>{
  const f=(x,y)=>.4+.3*Math.sin(x/70)*Math.cos(y/20);
  assert.deepEqual(encode(800,50,f),encode(800,50,f));
});
test('GPU bottom-up rows become correct top-down output rows',()=>{
  const out=encode(800,2,(_,y)=>y);
  assert.equal(matchRate(out.subarray(0,800),800,1,84),1);
  assert.equal(matchRate(out.subarray(800),800,1,68),1);
});
test('DPR and quality preserve apparent pattern spacing',()=>{
  for(const scale of [.5,.75,1,1.25,1.5,2,3]){
    const pixels=Math.round(84*scale);
    assert.ok(Math.abs(separation(0,pixels,.32)/scale-84)<1);
    assert.ok(Math.abs(separation(.8,pixels,.32)/scale-separation(.8,84,.32))<=1.1);
  }
});
test('1080p output is generated at native dimensions',()=>{
  const out=encode(1920,1080,()=>.5);
  assert.equal(out.byteLength,1920*1080*4);
  assert.equal(matchRate(out,1920,1080,separation(.5,84,.32)),1);
});
test('parallel row chunks reproduce the exact single-worker image without seams',()=>{
  const w=800,h=103,spacing=84,strength=.32;
  const src=frame(w,h,(x,y)=>.4+.3*Math.sin(x/70)*Math.cos(y/20));
  const expected=encodeFrame(src,w,h,spacing,strength,createWorkspace(w),createSeedField(w,h,1),new Uint32Array(w*h));
  const combined=new Uint32Array(w*h);
  for(let i=0;i<4;i++){
    const y=Math.floor(i*h/4),n=Math.floor((i+1)*h/4)-y;
    const stripe=src.slice((h-y-n)*w*4,(h-y)*w*4);
    const out=encodeFrame(stripe,w,n,spacing,strength,createWorkspace(w),createSeedField(w,n,1,y),new Uint32Array(w*n));
    combined.set(out,y*w);
  }
  assert.deepEqual(combined,expected);
});
function materialFrame(w,h){
  const src=frame(w,h,(x,y)=>.4+.3*Math.sin(x/70)*Math.cos(y/20));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((h-1-y)*w+x)*4;src[i+2]=Math.floor(x/67+y/11)%SURFACE_COUNT;src[i+3]=100+(x*13+y*7)%156;
  }
  return src;
}
function encodeMaterials(src,w,h,yOffset=0){return encodeFrame(src,w,h,84,.32,createWorkspace(w),createSeedField(w,h,1,yOffset),new Uint32Array(w*h),MATERIAL_PALETTE);}
test('surface colors preserve exact matching pixels across mixed materials and detail',()=>{
  const w=800,h=20,src=frame(w,h,()=>.7);
  for(let i=0;i<w*h;i++){src[i*4+2]=Math.floor(i/43)%SURFACE_COUNT;src[i*4+3]=80+i%176;}
  const out=encodeMaterials(src,w,h);
  assert.equal(matchRate(out,w,h,separation(.7,84,.32)),1);
  assert.ok(matchRate(out,w,h,51)<.45);
});
test('surface families have different hues without changing depth',()=>{
  const images=[];
  for(let kind=0;kind<SURFACE_COUNT;kind++){
    const src=frame(400,16,()=>.5);for(let i=0;i<400*16;i++)src[i*4+2]=kind;
    images.push(encodeMaterials(src,400,16));
  }
  for(let i=0;i<images.length;i++)for(let j=i+1;j<images.length;j++)assert.notDeepEqual(images[i],images[j]);
  const channels=image=>image.reduce((a,c)=>[a[0]+(c&255),a[1]+(c>>>8&255),a[2]+(c>>>16&255)],[0,0,0]);
  const sky=channels(images[SURFACE.SKY]),leaves=channels(images[SURFACE.LEAVES]),brick=channels(images[SURFACE.BRICK]);
  assert.ok(sky[2]>sky[0]);assert.ok(leaves[1]>leaves[0]&&leaves[1]>leaves[2]);assert.ok(brick[0]>brick[1]);
});
test('material encoding is stable and parallel chunks are bit-identical',()=>{
  const w=800,h=103,src=materialFrame(w,h),expected=encodeMaterials(src,w,h);
  assert.deepEqual(encodeMaterials(src,w,h),expected);
  const combined=new Uint32Array(w*h);
  for(let i=0;i<4;i++){
    const y=Math.floor(i*h/4),n=Math.floor((i+1)*h/4)-y;
    combined.set(encodeMaterials(src.slice((h-y-n)*w*4,(h-y)*w*4),w,n,y),y*w);
  }
  assert.deepEqual(combined,expected);
});
test('classic style ignores material metadata',()=>{
  const w=400,h=16,a=materialFrame(w,h),b=a.slice();
  for(let i=0;i<w*h;i++){b[i*4+2]=0;b[i*4+3]=255;}
  const encode=src=>encodeFrame(src,w,h,84,.32,createWorkspace(w),createSeedField(w,h,1),new Uint32Array(w*h));
  assert.deepEqual(encode(a),encode(b));
});
test('unconstrained edge pixels retain the surface palette instead of sky outlines',()=>{
  const w=32,h=8,src=frame(w,h,()=>.9);
  for(let i=0;i<w*h;i++)src[i*4+2]=SURFACE.LEAVES;
  const out=encodeMaterials(src,w,h);
  for(const c of out)assert.ok((c>>>8&255)>(c>>>16&255),'foliage seed should stay green');
});
test('mixing materials retains the full sharp contrast signal',()=>{
  const w=1024,h=80,one=frame(w,h,()=>.5),many=one.slice();
  for(let i=0;i<w*h;i++){one[i*4+2]=3;many[i*4+2]=Math.floor((i%w)/70)%SURFACE_COUNT;}
  const uniform=contrast(encodeMaterials(one,w,h)),mixed=contrast(encodeMaterials(many,w,h));
  assert.ok(mixed.rms>.45,`weak material signal: ${mixed.rms}`);
  assert.ok(mixed.sd/uniform.sd>.97,'mixing materials must not average away dot contrast');
});
test('only the intended separation has a strong correlation peak within the depth range',()=>{
  const w=1024,h=80,pixels=encodeMaterials(frame(w,h,()=>.5),w,h),expected=separation(.5,84,.32);
  assert.ok(correlation(pixels,w,h,expected)>.999);
  for(let s=50;s<=90;s++)if(Math.abs(s-expected)>2)
    assert.ok(Math.abs(correlation(pixels,w,h,s))<.15,`secondary stereo peak at ${s}`);
});
test('occlusion-freed seeds do not wrap and falsely match across repeated periods',()=>{
  const w=1024,h=240,{pixels,depth}=ringDepth(w,h);
  const output=encodeFrame(pixels,w,h,84,.32,createWorkspace(w),createSeedField(w,h,1),new Uint32Array(w*h),null,true);
  let equal=0,total=0;
  for(let y=0;y<h;y++){
    const same=linkRow(depth.subarray(y*w,(y+1)*w),84,.32,new Int32Array(w)),free=[];
    for(let x=0;x<w;x++)if(same[x]===x)free.push(x);
    for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)if((free[j]-free[i])%84===0){
      total++;equal+=output[y*w+free[i]]===output[y*w+free[j]];
    }
  }
  assert.ok(total>5000,'test must contain many independent disocclusion seeds');
  assert.ok(equal/total<.2,`false periodic matches ${equal/total}; old tiled seed forced 100%`);
});
test('dot size follows CSS pixels across display scaling and worker row boundaries',()=>{
  for(const grain of [1,2,3]){
    const base=createSeedField(100,24,1,0,grain),hiDpi=createSeedField(200,48,2,0,grain);
    for(let y=0;y<24;y++)for(let x=0;x<100;x++)assert.equal(base[y*100+x],hiDpi[y*2*200+x*2]);
    const stripe=createSeedField(100,13,1,11,grain);
    assert.deepEqual(stripe,base.subarray(1100));
  }
});
test('neutral mode preserves correspondence without material or chromatic cues',()=>{
  const w=800,h=20,src=frame(w,h,()=>.7);
  for(let i=0;i<w*h;i++)src[i*4+2]=i%SURFACE_COUNT;
  const out=encodeFrame(src,w,h,84,.32,createWorkspace(w),createSeedField(w,h,1),new Uint32Array(w*h),null,true);
  assert.equal(matchRate(out,w,h,separation(.7,84,.32)),1);
  for(const c of out){assert.equal(c&255,c>>>8&255);assert.equal(c&255,c>>>16&255);}
});

