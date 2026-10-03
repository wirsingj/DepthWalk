import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectContours, contourRadius } from '../src/contours.js';
import { encodeFrame, createWorkspace, separation, linkRow } from '../src/stereogram.js';
import { createSeedField, MATERIAL_PALETTE } from '../src/pattern.js';
import { contrast, correlation } from './stereo-quality.js';

function frame(w,h,depth,normal=()=>136){
  const data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((h-1-y)*w+x)*4,z=Math.round(depth(x,y)*65535);
    data[i]=z>>8;data[i+1]=z&255;data[i+2]=3;data[i+3]=normal(x,y);
  }
  return data;
}
function encode(src,w,h,mask,neutral=false,yOffset=0){
  return encodeFrame(src,w,h,120,.5,createWorkspace(w),createSeedField(w,h,1,yOffset,1),new Uint32Array(w*h),neutral?null:MATERIAL_PALETTE,neutral,mask);
}

test('silhouette contours stay on the foreground side and leave interiors clear',()=>{
  const w=80,h=60,mask=detectContours(frame(w,h,(x,y)=>x>=20&&x<60&&y>=15&&y<45?.8:0),w,h,1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const inside=x>=20&&x<60&&y>=15&&y<45;
    const border=inside&&(x<22||x>=58||y<17||y>=43);
    assert.equal(!!mask[y*w+x],border,`unexpected contour at ${x},${y}`);
  }
});
test('normal discontinuities reveal building corners at continuous depth',()=>{
  // Octahedral normal codes 136 = +Z, 143 = +X.
  const w=80,h=20,mask=detectContours(frame(w,h,()=>.6,x=>x<40?136:143),w,h,1);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.equal(!!mask[y*w+x],x>=38&&x<42);
});
test('smooth planes and texture metadata do not create false geometry contours',()=>{
  const w=200,h=50,src=frame(w,h,(x,y)=>.3+x*.0008+y*.0002);
  for(let i=0;i<w*h;i++)src[i*4+2]=i%10;
  assert.ok(detectContours(src,w,h,1).every(x=>x===0));
});
test('contour width tracks CSS pixels and bold is wider than crisp',()=>{
  for(const scale of [.5,1,1.5,2,3])for(const size of [1,2]){
    const w=120,h=30,r=contourRadius(scale,size);
    const mask=detectContours(frame(w,h,x=>x>=60?.8:0),w,h,scale,undefined,size);
    for(let x=0;x<w;x++)assert.equal(!!mask[15*w+x],x>=60&&x<60+r);
    assert.ok(Math.abs(r/scale-size)<=1);
  }
});
test('bold contours strengthen contrast at their actual stereo depth in every pattern',()=>{
  const w=1200,h=48,src=frame(w,h,(_,y)=>y>=24?.8:0),mask=detectContours(src,w,h,1);
  const disparity=separation(.8,120,.5);
  for(const style of ['materials','classic','mono']){
    const run=edges=>encodeFrame(src,w,h,120,.5,createWorkspace(w),createSeedField(w,h,1,0,1),new Uint32Array(w*h),style==='materials'?MATERIAL_PALETTE:null,style==='mono',edges);
    const plain=run(null),bold=run(mask),rim=bold.subarray(24*w,26*w);
    assert.ok(contrast(rim).sd>contrast(plain.subarray(24*w,26*w)).sd*1.25,'edge contrast did not increase');
    assert.ok(correlation(rim,w,2,disparity)>.999,'contour does not fuse at the surface depth');
    for(let shift=80;shift<=120;shift++)if(shift!==disparity)
      assert.ok(Math.abs(correlation(rim,w,2,shift))<.18,`false edge correlation at ${shift}`);
    assert.deepEqual(bold.subarray(30*w),plain.subarray(30*w),'interior was altered');
    assert.deepEqual(bold.subarray(0,24*w),plain.subarray(0,24*w),'background was altered');
    assert.deepEqual(run(mask),bold,'stationary contours are not stable');
  }
});
test('hidden contours cannot tint a visible equivalence class',()=>{
  const w=800,h=4,z=Float32Array.from({length:w},(_,x)=>x>=300&&x<500?.95:.05),accepted=new Uint8Array(w);
  linkRow(z,120,.5,new Int32Array(w),null,accepted);
  const mask=new Uint8Array(w*h);let hidden=0;
  for(let x=120;x<w-120;x++)if(!accepted[x]){hidden++;for(let y=0;y<h;y++)mask[y*w+x]=255;}
  assert.ok(hidden>10,'fixture needs occluded points');
  const src=frame(w,h,x=>z[x]);
  assert.deepEqual(encode(src,w,h,mask),encode(src,w,h,null));
});
test('halo rows preserve identical contours and pixels across worker seams',()=>{
  const w=800,h=103,src=frame(w,h,(x,y)=>x>200&&x<550&&y>24&&y<78?.85:.05,x=>x>400?143:136);
  for(const size of [1,2]){
    const mask=detectContours(src,w,h,1,undefined,size),expected=encode(src,w,h,mask),combined=new Uint32Array(w*h);
    for(let worker=0;worker<4;worker++){
      const y=Math.floor(worker*h/4),n=Math.floor((worker+1)*h/4)-y,r=contourRadius(1,size);
      const top=Math.min(y,r),bottom=Math.min(h-y-n,r),inputHeight=n+top+bottom;
      const input=src.slice((h-y-n-bottom)*w*4,(h-y+top)*w*4);
      const edges=detectContours(input,w,inputHeight,1,undefined,size).subarray(top*w,(top+n)*w);
      assert.deepEqual(edges,mask.subarray(y*w,(y+n)*w));
      combined.set(encode(input.subarray(bottom*w*4,(bottom+n)*w*4),w,n,edges,false,y),y*w);
    }
    assert.deepEqual(combined,expected);
  }
});
