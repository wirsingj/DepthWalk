import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {decodeDepth,prepareGeometry} from '../src/depth-frame.js';
import {detectContours} from '../src/contours.js';
import {correlation,contrast} from './stereo-quality.js';
import {separation} from '../src/stereogram.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(.00001,Math.abs(b)*.00003),`${a} != ${b}`);
function source(width,height,fn){return {width,height,depth:Float32Array.from({length:width*height},(_,i)=>fn(i%width,Math.floor(i/width))),format:'view-z'};}

test('linear and perspective/reversed/orthographic device depth agree in world units',()=>{
  const values=[.2,1,5,25,70,Infinity],near=.1,far=100;
  for(const projection of ['perspective','orthographic'])for(const reverseZ of [false,true]){
    const depth=Float64Array.from(values,d=>{
      const raw=d===Infinity?1:projection==='orthographic'?(d-near)/(far-near):far/(far-near)-far*near/((far-near)*d);
      return reverseZ?1-raw:raw;
    });
    const out=decodeDepth({width:values.length,height:1,depth,format:'device-depth',near,far,projection,reverseZ});
    out.forEach((v,i)=>i===5?assert.equal(v,Infinity):close(v,values[i]));
  }
  const infinite=decodeDepth({width:3,height:1,depth:Float32Array.of(0,.5,1),format:'device-depth',near:1,far:Infinity});
  assert.deepEqual([...infinite],[1,2,Infinity]);
});
test('row origins and packed RG depth ignore every host color/normal byte',()=>{
  const packed=new Uint8Array(4*3*4);
  for(let i=0;i<12;i++){const q=5000+i*3000;packed[i*4]=q>>8;packed[i*4+1]=q&255;packed[i*4+2]=i*13;packed[i*4+3]=i*17;}
  const frame={width:4,height:3,depth:packed,format:'packed-proximity-rg16',origin:'bottom-left'};
  const a=decodeDepth(frame),other=packed.slice();
  for(let i=0;i<12;i++){other[i*4+2]=255;other[i*4+3]=0;}
  assert.deepEqual(decodeDepth({...frame,depth:other}),a);
  close(a[0],-22*Math.log((5000+8*3000)/65535));
  const filter=new DepthWalkFilter(),first=filter.render(frame).pixels.slice();
  assert.deepEqual(filter.render({...frame,depth:other}).pixels,first);
});
test('normalized proximity maps to the same scalar distances as view-Z',()=>{
  const values=[0,.2,.5,.8,1];
  const out=decodeDepth({width:5,height:1,depth:Float64Array.from(values),format:'proximity',depthRange:30});
  assert.equal(out[0],Infinity);for(let i=1;i<5;i++)close(out[i],-30*Math.log(values[i]));
  assert.deepEqual([...decodeDepth({width:4,height:1,depth:Float32Array.of(NaN,-1,Infinity,4)})],[Infinity,Infinity,Infinity,4]);
});
test('depth-only geometry reconstructs a floor without any supplied normals or labels',()=>{
  const width=600,height=160,focal=height/(2*Math.tan(62*Math.PI/360));
  const floor=source(width,height,(_x,y)=>y>85?1.8*focal/(y+.5-height/2):Infinity);
  const {packed}=prepareGeometry(floor);
  let correct=0,count=0;
  for(let y=95;y<height-4;y++)for(let x=20;x<width-20;x+=11){
    const i=((height-1-y)*width+x)*4;
    correct+=packed[i+2]===2;count++;
  }
  assert.equal(correct,count,'generated floor hue is not consistent');
  const contours=detectContours(packed,width,height,1);
  for(let y=100;y<height-4;y++)for(let x=10;x<width-10;x+=11)assert.equal(contours[y*width+x],0,'flat floor has a false crease');
});
test('depth-only creases are found where planes meet without a depth jump',()=>{
  const w=600,h=100,frame=source(w,h,x=>1/(.08+Math.abs(x-300)*.0012));
  const {packed}=prepareGeometry(frame),mask=detectContours(packed,w,h,1);
  assert.ok(mask[50*w+300]>0,'fold was not detected from depth');
  assert.equal(mask[50*w+150],0,'planar interior has false contours');
});
test('orthographic planar depth also stays free of false contour bands',()=>{
  const w=160,h=100,frame={...source(w,h,(_x,y)=>2+y*.6),projection:'orthographic',orthographicHeight:20};
  const {packed}=prepareGeometry(frame),mask=detectContours(packed,w,h,1,undefined,2,'orthographic');
  for(let y=5;y<h-5;y++)for(let x=5;x<w-5;x++)assert.equal(mask[y*w+x],0);
});
test('public filter produces real stable stereo from an engine-free scalar depth map',()=>{
  const w=800,h=32,frame=source(w,h,()=>12),filter=new DepthWalkFilter();
  const first=filter.render(frame).pixels.slice(),s=separation(Math.exp(-12/22),120,.5);
  assert.equal(first.length,w*h);
  assert.ok(correlation(first,w,h,s)>.999);assert.ok(contrast(first).rms>.45);
  assert.deepEqual(filter.render(frame).pixels,first);
  assert.notDeepEqual(filter.render(source(w,h,()=>40)).pixels,first,'depth must drive the image');
  assert.deepEqual(filter.render(frame).pixels,first);
});
test('filter stripe halos reproduce full-frame shading and contours at all qualities',()=>{
  const w=600,h=123,frame=source(w,h,(x,y)=>x>230&&x<420&&y>26&&y<95?8:30+y*.03);
  for(const pixelRatio of [.5,1,2])for(const edges of [0,1,2]){
    const settings={pixelRatio,edges},filter=new DepthWalkFilter(),expected=filter.render(frame,settings).pixels.slice(),combined=new Uint32Array(w*h);
    for(let i=0;i<4;i++){
      const start=Math.floor(i*h/4),end=Math.floor((i+1)*h/4),halo=requiredHalo(pixelRatio,edges),top=Math.max(0,start-halo),bottom=Math.min(h,end+halo);
      const stripe={...frame,height:bottom-top,fullHeight:h,yOffset:top,cropTop:start-top,cropBottom:bottom-end,depth:frame.depth.subarray(top*w,bottom*w)};
      combined.set(new DepthWalkFilter().render(stripe,settings).pixels,start*w);
    }
    assert.deepEqual(combined,expected,`seam at ${pixelRatio}/${edges}`);
  }
});
test('API rejects ambiguous frame formats and invalid bounds',()=>{
  const filter=new DepthWalkFilter(),frame=source(20,12,()=>4);
  for(const edit of [{format:'unknown'},{origin:'unknown'},{height:0},{depth:new Float32Array(2)},{format:'device-depth'},{cropTop:12},{yOffset:1},{verticalFov:0}])assert.throws(()=>filter.render({...frame,...edit}));
  for(const settings of [{pixelRatio:0},{depthRange:0},{depthStrength:2},{edges:5},{pattern:'host-materials'}])assert.throws(()=>filter.render(frame,settings));
});
