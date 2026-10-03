import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {linkRow,separation} from '../src/stereogram.js';
import {linearLuminance,localChroma,srgbToLinear} from '../src/chroma-stereo.js';
import {reconstructStereogram,compareReconstruction} from '../src/debug/reconstruct.js';

const width=840,height=120;
function fixture(){
  const depth=new Uint8Array(width*height*4),color=new Uint8Array(depth.length),object=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,inside=Math.abs(x-width/2)+Math.abs(y-height/2)*2<100,q=Math.round((inside?.8:.1)*65535);object[i]=+inside;
    depth.set([q>>8,q&255,0,255],i*4);color.set(inside?[215,181,56,255]:[62,103,137,255],i*4);
  }
  return {width,height,depth,color,object,format:'packed-proximity-rg16'};
}
test('local chroma matches linear luminance across saturated colors without clipping the carrier',()=>{
  let maximum=0;
  for(let r=0;r<=255;r+=51)for(let g=0;g<=255;g+=51)for(let b=0;b<=255;b+=51)for(const level of [20,60,100,128,180,220]){
    const p=localChroma(r,g,b,level),error=Math.abs(linearLuminance(p)-srgbToLinear(level/255));maximum=Math.max(maximum,error);
    assert.equal(p>>>24,255);
  }
  assert.ok(maximum<.0045,`linear-light quantization error ${maximum}`);
});
test('diamond color reaches its visible eye pair but cannot propagate remote bands',()=>{
  const frame=fixture(),changed=frame.color.slice(),f=new DepthWalkFilter();
  for(let i=0;i<frame.object.length;i++)if(frame.object[i])changed.set([200,45,150,255],i*4);
  const allowed=new Uint8Array(width*height);let paired=0;
  for(let y=0;y<height;y++){
    const z=Float32Array.from({length:width},(_,x)=>(frame.depth[(y*width+x)*4]*256+frame.depth[(y*width+x)*4+1])/65535),visible=new Uint8Array(width);linkRow(z,120,.5,new Int32Array(width),null,visible);
    for(let x=0;x<width;x++)if(visible[x]&&frame.object[y*width+x]){const s=separation(z[x],120,.5),left=x-(s>>1);allowed[y*width+left]=allowed[y*width+left+s]=1;}
  }
  let referenceSpill=0,localChanges=0;
  for(const pattern of ['scene','chroma','chroma-soft']){
    const a=f.render(frame,{pattern,surfaceDetail:.65}).pixels.slice(),b=f.render({...frame,color:changed},{pattern,surfaceDetail:.65}).pixels;
    for(let i=0;i<a.length;i++)if(a[i]!==b[i]){
      if(pattern==='scene'&&!frame.object[i])referenceSpill++;
      if(pattern!=='scene'){assert.ok(allowed[i],'object hue leaked outside projected eye silhouettes');localChanges++;}
    }
    if(pattern==='chroma')for(let y=0;y<height;y++){
      const z=Float32Array.from({length:width},(_,x)=>(frame.depth[(y*width+x)*4]*256+frame.depth[(y*width+x)*4+1])/65535),visible=new Uint8Array(width);linkRow(z,120,.5,new Int32Array(width),null,visible);
      for(let x=0;x<width;x++)if(visible[x]&&frame.object[y*width+x]){const s=separation(z[x],120,.5),left=x-(s>>1);assert.equal(a[y*width+left],a[y*width+left+s],'foreground hue is not at its binocular depth');paired++;}
    }
  }
  assert.ok(referenceSpill>width*height*.1,'fixture must expose propagated reference bands');assert.ok(localChanges>1000&&paired>1000);
});
test('local colors retain the complete stereo graph in linear luminance, not identical RGB',()=>{
  const frame=fixture(),out=new DepthWalkFilter().render(frame,{pattern:'chroma',surfaceDetail:.65}).pixels;let max=0,different=0;
  for(let y=0;y<height;y++){
    const z=Float32Array.from({length:width},(_,x)=>(frame.depth[(y*width+x)*4]*256+frame.depth[(y*width+x)*4+1])/65535),same=linkRow(z,120,.5,new Int32Array(width));
    for(let x=0;x<width;x++){
      const a=out[y*width+x],b=out[y*width+same[x]];max=Math.max(max,Math.abs(linearLuminance(a)-linearLuminance(b)));different+=a!==b;
    }
  }
  assert.ok(max<.008,`paired luminance difference ${max}`);assert.ok(different>1000,'do not accidentally project local hues into repeating classes');
  const decoded=reconstructStereogram({pixels:out,width,height,maxColumns:140,maxRows:60}),comparison=compareReconstruction(decoded,{depth:frame.depth,origin:'top-left'});
  const reference=new DepthWalkFilter().render(frame,{pattern:'quiet',surfaceDetail:.65}).pixels;
  const baseline=compareReconstruction(reconstructStereogram({pixels:reference,width,height,maxColumns:140,maxRows:60}),{depth:frame.depth,origin:'top-left'});
  assert.ok(comparison.summary.interiorWithinTwoPixels>.95&&comparison.summary.interiorWithinTwoPixels>=baseline.summary.interiorWithinTwoPixels-.005,JSON.stringify({local:comparison.summary,baseline:baseline.summary}));
  assert.ok(comparison.summary.confidentWrongFraction<.01,JSON.stringify(comparison.summary));
});
test('local color is stable, seam-free, origin-aware and falls back without color',()=>{
  const frame=fixture(),f=new DepthWalkFilter(),original=frame.color.slice();
  for(const pixelRatio of [.5,1,1.5,2])for(const dotSize of [1,2]){
    const settings={pattern:'chroma',surfaceDetail:.65,pixelRatio,dotSize},all=f.render(frame,settings).pixels.slice(),joined=new Uint32Array(all.length);
    assert.deepEqual(f.render(frame,settings).pixels,all);
    for(let k=0;k<3;k++){
      const start=k*40,end=start+40,halo=requiredHalo(pixelRatio),top=Math.max(0,start-halo),bottom=Math.min(height,end+halo);
      joined.set(new DepthWalkFilter().render({...frame,height:bottom-top,fullHeight:height,yOffset:top,cropTop:start-top,cropBottom:bottom-end,depth:frame.depth.subarray(top*width*4,bottom*width*4),color:frame.color.subarray(top*width*4,bottom*width*4)},settings).pixels,start*width);
    }
    assert.deepEqual(joined,all);
    const depth=new Uint8Array(frame.depth.length),color=new Uint8Array(depth.length);
    for(let y=0;y<height;y++){depth.set(frame.depth.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);color.set(frame.color.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);}
    assert.deepEqual(f.render({...frame,depth,color,origin:'bottom-left'},settings).pixels,all);
  }
  assert.deepEqual(frame.color,original);
  const noColor={...frame,color:undefined},expected=f.render(noColor,{pattern:'geometry'}).pixels.slice();assert.deepEqual(f.render(noColor,{pattern:'chroma'}).pixels,expected);
});
test('background color loses saturation when its eye partner belongs to a different foreground hue',()=>{
  const frame=fixture(),pixels=new DepthWalkFilter().render(frame,{pattern:'chroma'}).pixels;let conflicts=0;
  for(let y=0;y<height;y++){
    const z=Float32Array.from({length:width},(_,x)=>(frame.depth[(y*width+x)*4]*256+frame.depth[(y*width+x)*4+1])/65535),visible=new Uint8Array(width),owner=new Int32Array(width).fill(-1);
    linkRow(z,120,.5,new Int32Array(width),null,visible);
    for(let x=0;x<width;x++)if(visible[x]){const s=separation(z[x],120,.5),l=x-(s>>1);for(const endpoint of [l,l+s])if(owner[endpoint]<0||z[x]>=z[owner[endpoint]])owner[endpoint]=x;}
    for(let x=0;x<width;x++)if(owner[x]>=0&&!frame.object[y*width+owner[x]]){
      const center=owner[x],s=separation(z[center],120,.5),l=center-(s>>1),partner=owner[x===l?l+s:l];
      if(partner>=0&&frame.object[y*width+partner]){
        const c=pixels[y*width+x];assert.ok((c&255)===(c>>>8&255)&&(c&255)===(c>>>16&255),'unmatched background tint remains');conflicts++;
      }
    }
  }
  assert.ok(conflicts>100,'fixture must contain competing background/foreground color endpoints');
});
