import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {decodeDepth,prepareGeometry} from '../src/depth-frame.js';
import {linkRow,separation,createWorkspace,encodeFrame} from '../src/stereogram.js';
import {contrast,correlation,ringDepth,luminance} from './stereo-quality.js';
import {SHADED_GEOMETRY_PALETTE,SHADED_CONTOUR_PALETTE,COLOR_BAND_COUNT,SHADE_STEPS,GEOMETRY_PALETTE} from '../src/pattern.js';

function frame(width,height,fn){
  return {width,height,format:'view-z',depth:Float32Array.from({length:width*height},(_,i)=>fn(i%width,Math.floor(i/width)))};
}
function channels(pixels){
  const rgb=[0,0,0];
  for(const c of pixels){rgb[0]+=c&255;rgb[1]+=c>>>8&255;rgb[2]+=c>>>16&255;}
  return rgb.map(c=>c/pixels.length);
}

test('exposed roots cannot form high-contrast vertical color ribbons',()=>{
  const w=1000,h=8,source=frame(w,h,x=>x>350&&x<650?2:Infinity),{packed}=prepareGeometry(source);
  // Exhaust the eight tones at each column to measure tint, not random noise.
  const seeds=Uint32Array.from({length:w*h},(_,i)=>Math.floor(i/w));
  const pixels=encodeFrame(packed,w,h,120,.5,createWorkspace(w),seeds,new Uint32Array(w*h),GEOMETRY_PALETTE,false,null,true);
  const means=Array.from({length:w},(_,x)=>{let sum=0;for(let y=0;y<h;y++)sum+=luminance(pixels[y*w+x]);return sum/h;});
  const range=Math.max(...means)-Math.min(...means);
  assert.ok(range<20,`occlusion roots created a ${range.toFixed(1)}-level dark ribbon`);
});

test('shaded ramps retain eight ordered opaque tones through the nearest contour highlight',()=>{
  for(const palette of [SHADED_GEOMETRY_PALETTE,SHADED_CONTOUR_PALETTE]){
    assert.equal(palette.length,SHADE_STEPS*COLOR_BAND_COUNT*8);
    for(let offset=0;offset<palette.length;offset+=8){
      let previous=-1;
      for(let tone=0;tone<8;tone++){
        const color=palette[offset+tone],value=luminance(color);
        assert.equal(color>>>24,255);
        assert.ok(value>previous+3,'highlight clipping/wrapping destroyed ordered dot tones');
        previous=value;
      }
    }
  }
});

test('the same surface gets distinctly brighter with proximity without weakening stereo contrast',()=>{
  const w=1000,h=80,filter=new DepthWalkFilter();let previous=0;
  for(const distance of [60,30,14,4]){
    const pixels=filter.render(frame(w,h,()=>distance),{edges:0}).pixels;
    const stats=contrast(pixels),shift=separation(Math.exp(-distance/22),120,.5);
    assert.ok(stats.mean>previous+12,`indistinct distance shade at ${distance}: ${stats.mean} after ${previous}`);
    assert.ok(stats.rms>.43,`dot contrast lost at distance ${distance}`);
    assert.ok(correlation(pixels,w,h,shift)>.999,'shading broke the intended disparity');
    for(let s=80;s<=120;s++)if(Math.abs(s-shift)>2)
      assert.ok(Math.abs(correlation(pixels,w,h,s))<.15,`shading introduced another correlation peak at ${s}`);
    previous=stats.mean;
  }
});

test('depth-derived colors use paving, masonry and consistent foliage-like greens',()=>{
  const w=800,h=80,filter=new DepthWalkFilter(),step=2/h;
  const plane=(nx,ny)=>filter.render({...frame(w,h,(x,y)=>24+(x-w/2)*step*nx+(h/2-y)*step*ny),projection:'orthographic',orthographicHeight:2},{edges:0}).pixels.slice();
  const floor=channels(plane(0,8)),wall=channels(plane(0,0)),side=channels(plane(1.5,0));
  const upward=channels(plane(0,.8)),downward=channels(plane(0,-.8));
  assert.ok(floor[0]>floor[2]+15&&floor[1]>floor[2]+15&&Math.abs(floor[0]-floor[1])<12,'horizontal plane should read warm paving stone');
  assert.ok(wall[1]>wall[0]+20&&Math.abs(wall[2]-wall[1])<12,'upright plane should read cool concrete');
  assert.ok(side[0]>side[1]+25&&side[1]>side[2]+10,'side plane should read warm masonry');
  for(const rgb of [upward,downward])assert.ok(rgb[1]>rgb[0]+30&&rgb[1]>rgb[2]+35,'both sides of inclined shapes should remain green');
});

test('a local hue change cannot tint unrelated stereo classes across the same row',()=>{
  const w=1000,h=8,{packed}=prepareGeometry(frame(w,h,()=>12)),other=packed.slice();
  for(let y=0;y<h;y++)for(let x=400;x<410;x++)other[((h-1-y)*w+x)*4+2]=7;
  const seeds=Uint32Array.from({length:w*h},(_,i)=>Math.floor(i/w));
  const encode=source=>encodeFrame(source,w,h,120,.5,createWorkspace(w),seeds,new Uint32Array(w*h),GEOMETRY_PALETTE,false,null,true);
  const a=encode(packed),b=encode(other),z=Float32Array.from({length:w},(_,x)=>(packed[x*4]*256+packed[x*4+1])/65535);
  const same=linkRow(z,120,.5,new Int32Array(w));
  for(let x=w-1;x>=0;x--)if(same[x]!==x)same[x]=same[same[x]];
  const affected=new Set();
  for(let x=400;x<410;x++)affected.add(same[x-(separation(z[x],120,.5)>>1)]);
  let unchanged=0,changed=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(!affected.has(same[x])){assert.equal(a[i],b[i],'hue leaked into an unrelated class');unchanged++;}
    else changed+=a[i]!==b[i];
  }
  assert.ok(unchanged>w*h*.8&&changed>100,'fixture must exercise both affected and unrelated classes');
});

test('background is dark blue and remains sharply fuseable at the far spacing',()=>{
  const w=1000,h=80,pixels=new DepthWalkFilter().render(frame(w,h,()=>Infinity)).pixels;
  const rgb=channels(pixels),stats=contrast(pixels);
  assert.ok(rgb[2]>rgb[0]+50&&rgb[2]>rgb[1]+40);
  assert.ok(stats.mean<70&&stats.rms>.45,'sky should be darker without flat low-contrast dots');
  assert.ok(correlation(pixels,w,h,120)>.999);
});

test('overlapping shaded geometry preserves every final stereo link and independent exposed seeds',()=>{
  const w=1000,h=220,{pixels}=ringDepth(w,h);
  const source={width:w,height:h,depth:pixels,format:'packed-proximity-rg16',origin:'bottom-left'};
  const filter=new DepthWalkFilter(),output=filter.render(source).pixels.slice(),distance=decodeDepth(source);
  let distinct=0,freePairs=0,links=0;
  for(let y=0;y<h;y++){
    const depth=Float32Array.from(distance.subarray(y*w,(y+1)*w),d=>Math.exp(-d/22));
    const same=linkRow(depth,120,.5,new Int32Array(w)),free=[];
    for(let x=0;x<w;x++){
      if(same[x]!==x){links++;assert.equal(output[y*w+x],output[y*w+same[x]],'unmatched shaded eye pixels');}
      else free.push(x);
    }
    for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)if((free[j]-free[i])%120===0){
      freePairs++;distinct+=output[y*w+free[i]]!==output[y*w+free[j]];
    }
  }
  assert.ok(links>w*h*.7&&freePairs>1000);
  assert.ok(distinct/freePairs>.8,'exposed seeds acquired false periodic copies');
  assert.deepEqual(filter.render(source).pixels,output,'shading shimmered in a stationary frame');
});

test('shaded contours keep their contrast advantage at both far and near depths',()=>{
  const w=1000,h=80,filter=new DepthWalkFilter();
  for(const distance of [45,5]){
    const source=frame(w,h,(_x,y)=>y<40?Infinity:distance);
    const plain=filter.render(source,{edges:0}).pixels.slice();
    const bold=filter.render(source,{edges:2}).pixels.slice(),rim=bold.subarray(40*w,42*w);
    assert.ok(contrast(rim).sd>contrast(plain.subarray(40*w,42*w)).sd*1.25);
    assert.ok(correlation(rim,w,2,separation(Math.exp(-distance/22),120,.5))>.999);
    assert.deepEqual(bold.subarray(44*w),plain.subarray(44*w));
  }
});
