import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {linkRow} from '../src/stereogram.js';
import {surfacePatch,surfaceFeature} from '../src/surface-stereo.js';
import {prepareGeometry} from '../src/depth-frame.js';
import {detectContours} from '../src/contours.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';
import {imageFidelity} from '../src/debug/image-fidelity.js';
const width=600,height=96;
function fixture(){return {width,height,depth:Float32Array.from({length:width*height},(_,i)=>i%width>210&&i%width<390?7:35),color:Uint8Array.from({length:width*height*4},(_,i)=>{const x=(i>>2)%width,c=i%4;return c===3?255:x>210&&x<390?[185,155,65][c]:[60,105,140][c];})};}
const error=(pixels,color)=>{let sum=0;for(let i=0;i<pixels.length;i++)for(let c=0;c<3;c++){const d=(pixels[i]>>>(8*c)&255)-color[i*4+c];sum+=d*d;}return Math.sqrt(sum/(pixels.length*3));};
test('surface color fit reduces original-image error without violating selected visible pairs',()=>{
  const frame=fixture(),settings={pattern:'surface',surfaceDetail:.65},f=new DepthWalkFilter(),surface=f.render(frame,settings).pixels.slice(),dense=f.render(frame,{pattern:'scene'}).pixels.slice();
  assert.ok(error(surface,frame.color)<error(dense,frame.color)*.6);
  const packed=prepareGeometry(frame,settings).packed,contours=detectContours(packed,width,height,1);let selected=0;
  for(let y=0;y<height;y++){
    const z=Float32Array.from(frame.depth.subarray(y*width,(y+1)*width),d=>Math.exp(-d/22));
    const mask=Uint8Array.from({length:width},(_,x)=>Number(!!contours[y*width+x]||surfacePatch(x,y,1,.65)||surfaceFeature(frame.color,(y*width+x)*4,x,width,1)));
    const accepted=new Uint8Array(width),same=linkRow(z,120,.5,new Int32Array(width),null,accepted,undefined,mask);
    for(let x=0;x<width;x++){assert.equal(surface[y*width+x],surface[y*width+same[x]]);selected+=accepted[x];}
  }
  assert.ok(selected>width*height*.1&&selected<width*height*.4);
});
test('quiet mode retains the complete dense constraint graph with reduced grain',()=>{
  const frame=fixture(),f=new DepthWalkFilter(),quiet=f.render(frame,{pattern:'quiet'}).pixels.slice(),dense=f.render(frame,{pattern:'scene'}).pixels;
  assert.ok(error(quiet,frame.color)<error(dense,frame.color)*.65);
  for(let y=0;y<height;y++){
    const z=Float32Array.from(frame.depth.subarray(y*width,(y+1)*width),d=>Math.exp(-d/22)),same=linkRow(z,120,.5,new Int32Array(width));
    for(let x=0;x<width;x++)assert.equal(quiet[y*width+x],quiet[y*width+same[x]]);
  }
});
test('Quiet preserves source appearance rather than hiding banding by erasing scene cues',()=>{
  const frame=fixture(),filter=new DepthWalkFilter();
  for(const surfaceDetail of [.35,.55,1]){
    const settings={pattern:'quiet',surfaceDetail,edges:0};
    const baseline=filter.render(frame,settings).pixels.slice();
    const recolored=Uint8Array.from(frame.color,(v,i)=>i%4===3?255:255-v);
    assert.notDeepEqual(filter.render({...frame,color:recolored},settings).pixels,baseline,'source colors were discarded');
    assert.notDeepEqual(filter.render(frame,{...settings,edges:2}).pixels,baseline,'contour cues were discarded');
  }
});
test('surface styles remain deterministic, immutable and seamless across worker stripes',()=>{
  const frame=fixture(),original=frame.color.slice();
  for(const pattern of ['surface','quiet'])for(const pixelRatio of [.5,1,1.5,2]){
    const settings={pattern,pixelRatio,surfaceDetail:.65},f=new DepthWalkFilter(),all=f.render(frame,settings).pixels.slice(),joined=new Uint32Array(all.length);
    assert.deepEqual(f.render(frame,settings).pixels,all);
    for(let k=0;k<3;k++){
      const start=k*height/3,end=(k+1)*height/3,halo=requiredHalo(pixelRatio),top=Math.max(0,start-halo),bottom=Math.min(height,end+halo);
      joined.set(new DepthWalkFilter().render({...frame,height:bottom-top,fullHeight:height,yOffset:top,cropTop:start-top,cropBottom:bottom-end,depth:frame.depth.subarray(top*width,bottom*width),color:frame.color.subarray(top*width*4,bottom*width*4)},settings).pixels,start*width);
    }
    assert.deepEqual(joined,all);assert.deepEqual(frame.color,original);
  }
});
test('surface support changes coverage while absent colors retain the portable fallback',()=>{
  const frame=fixture(),f=new DepthWalkFilter();f.render(frame,{pattern:'surface',surfaceDetail:0});const low=f.surfaceStats.selected;
  f.render(frame,{pattern:'surface',surfaceDetail:1});assert.ok(f.surfaceStats.selected>low*2);
  const noColor={...frame,color:undefined},expected=f.render(noColor,{pattern:'geometry'}).pixels.slice();
  for(const pattern of ['surface','quiet'])assert.deepEqual(f.render(noColor,{pattern}).pixels,expected);
  assert.throws(()=>f.render(frame,{pattern:'surface',surfaceDetail:2}));
});
test('surface texture supplies measurable image-only depth, with weak areas left uncertain',()=>{
  const frame=fixture(),pixels=new DepthWalkFilter().render(frame,{pattern:'surface',surfaceDetail:.65}).pixels;
  const decoded=reconstructStereogram({pixels,width,height,maxColumns:150,maxRows:48});
  const depth=new Uint8Array(width*height*4);for(let i=0;i<frame.depth.length;i++){const q=Math.round(Math.exp(-frame.depth[i]/22)*65535);depth[i*4]=q>>8;depth[i*4+1]=q&255;}
  const comparison=compareReconstruction(decoded,{depth,origin:'top-left'});
  assert.ok(comparison.summary.interiorWithinTwoPixels>.85,JSON.stringify(comparison.summary));
  assert.ok(comparison.summary.confidentWrongFraction<.025);
  assert.ok(decoded.summary.reliableFraction>.15&&decoded.summary.reliableFraction<.9,'do not invent confidence across quiet areas');
});
test('image-fidelity metrics preserve row origin and separate fine grain from broad color shifts',()=>{
  const w=64,h=32,color=new Uint8Array(w*h*4),exact=new Uint32Array(w*h),grain=new Uint32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const v=70+y*3;exact[y*w+x]=(0xff000000|v|v<<8|v<<16)>>>0;
    color.set([v,v,v,255],((h-1-y)*w+x)*4);
    const noisy=v+((x+y)%2?20:-20);grain[y*w+x]=(0xff000000|noisy|noisy<<8|noisy<<16)>>>0;
  }
  assert.equal(imageFidelity(exact,color,w,h).sourceRMSE,0);
  const result=imageFidelity(grain,color,w,h);assert.equal(result.sourceRMSE,20);assert.ok(result.broadColorRMSE<.1);
  const shifted=Uint32Array.from(exact,c=>c+0x141414);assert.equal(imageFidelity(shifted,color,w,h).broadColorRMSE,20);
});
