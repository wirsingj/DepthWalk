import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter,requiredHalo} from '../src/depthwalk.js';
import {linkRow} from '../src/stereogram.js';
import {contrast,correlation} from './stereo-quality.js';
import {AdaptiveQuality,targetFrameRate} from '../src/performance.js';
const width=600,height=65;
function frame(){return {width,height,depth:Float32Array.from({length:width*height},(_,i)=>i%width>200&&i%width<400?8:35),color:Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:(i%4===1?150:40)+Math.floor(i/4/width)%11)};}
test('scene color is optional and geometry fallback remains byte-identical',()=>{
  const f=frame(),filter=new DepthWalkFilter(),a=filter.render({...f,color:undefined},{pattern:'geometry'}).pixels.slice();
  assert.deepEqual(filter.render({...f,color:undefined},{pattern:'scene'}).pixels,a);
  assert.deepEqual(filter.render(f,{pattern:'geometry'}).pixels,a);
  assert.throws(()=>filter.render({...f,color:new Uint8Array(4)},{pattern:'scene'}));
});
test('scene colors influence hue while all geometry correspondences remain identical',()=>{
  const f=frame(),filter=new DepthWalkFilter(),a=filter.render(f,{pattern:'scene'}).pixels.slice(),other=f.color.slice();
  for(let i=0;i<other.length;i+=4){other[i]=180;other[i+1]=50;}
  assert.notDeepEqual(filter.render({...f,color:other},{pattern:'scene'}).pixels,a);
  assert.deepEqual(filter.render(f,{pattern:'scene'}).pixels,a);
  for(let y=0;y<height;y++){
    const z=Float32Array.from(f.depth.subarray(y*width,(y+1)*width),d=>Math.exp(-d/22)),same=linkRow(z,120,.5,new Int32Array(width));
    for(let x=0;x<width;x++)assert.equal(a[y*width+x],a[y*width+same[x]]);
  }
  assert.ok(contrast(a).rms>.45);
});
test('scene colors preserve row origin, worker seams and input buffers',()=>{
  const f=frame(),copy=f.color.slice(),settings={pattern:'scene'},expected=new DepthWalkFilter().render(f,settings).pixels.slice(),joined=new Uint32Array(width*height);
  for(let k=0;k<3;k++){
    const start=Math.floor(k*height/3),end=Math.floor((k+1)*height/3),halo=requiredHalo(),top=Math.max(0,start-halo),bottom=Math.min(height,end+halo);
    joined.set(new DepthWalkFilter().render({...f,height:bottom-top,fullHeight:height,yOffset:top,cropTop:start-top,cropBottom:bottom-end,depth:f.depth.subarray(top*width,bottom*width),color:f.color.subarray(top*width*4,bottom*width*4)},settings).pixels,start*width);
  }
  assert.deepEqual(joined,expected);assert.deepEqual(f.color,copy);
  const bottom={...f,origin:'bottom-left',depth:f.depth.slice(),color:f.color.slice()};
  for(let y=0;y<height;y++){bottom.depth.set(f.depth.subarray(y*width,(y+1)*width),(height-1-y)*width);bottom.color.set(f.color.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);}
  assert.deepEqual(new DepthWalkFilter().render(bottom,settings).pixels,expected);
});
test('scene-color dots retain a unique intended separation at fixed depth',()=>{
  const f=frame();f.depth.fill(12);const pixels=new DepthWalkFilter().render(f,{pattern:'scene',edges:0}).pixels;
  const shift=Math.round(240*(1-.5*Math.exp(-12/22))/(2-.5*Math.exp(-12/22)));
  assert.ok(correlation(pixels,width,height,shift)>.999);
  for(let s=80;s<=120;s++)if(Math.abs(s-shift)>2)assert.ok(Math.abs(correlation(pixels,width,height,s))<.16);
});
test('all source-color modes preserve cropped bottom-left views across input reuse',()=>{
  const top={...frame(),cropTop:2,cropBottom:5};
  for(const Type of [Uint8Array,Uint8ClampedArray]){
    const storage=new Type(top.color.length+32),color=storage.subarray(16,16+top.color.length);
    const bottom={...top,origin:'bottom-left',depth:top.depth.slice(),color};
    for(let y=0;y<height;y++){
      bottom.depth.set(top.depth.subarray(y*width,(y+1)*width),(height-1-y)*width);
      color.set(top.color.subarray(y*width*4,(y+1)*width*4),(height-1-y)*width*4);
    }
    for(const pattern of ['scene','quiet','surface','chroma','chroma-soft']){
      const filter=new DepthWalkFilter(),reference=new DepthWalkFilter(),settings={pattern,temporalStability:true};
      for(let step=0;step<3;step++){
        const input=step===1?top:bottom,before=storage.slice();
        assert.deepEqual(filter.render(input,settings).pixels,reference.render(top,settings).pixels,`${Type.name}/${pattern}/${step}`);
        assert.deepEqual(storage,before);
      }
    }
  }
});
test('automatic quality responds to sustained work bottlenecks, not refresh limits alone',()=>{
  const a=new AdaptiveQuality();assert.equal(a.update(10,90,3000),false);assert.equal(a.update(10,90,4000),true);assert.equal(a.factor,.8);
  for(let t=5000;t<30000;t+=1000)a.update(10,90,t);assert.equal(a.factor,.35);
  const b=new AdaptiveQuality();for(let t=3000;t<20000;t+=1000)b.update(30,5,t);assert.equal(b.factor,1,'30 Hz display must not lower quality without slow work');
});

test('CPU auto quality can recover at its intentional 40 fps cap',()=>{
  assert.equal(targetFrameRate(60,true),30);assert.equal(targetFrameRate(120,true),40);
  assert.equal(targetFrameRate(30,false),30);assert.equal(targetFrameRate(120,false),60);
  const quality=new AdaptiveQuality();quality.update(15,55,3000,40);quality.update(15,55,4000,40);
  assert.equal(quality.factor,.8);
  for(let t=5000;t<=13000;t+=1000)quality.update(40,8,t,40);
  assert.equal(quality.factor,1);
  const sixtyHzCPU=new AdaptiveQuality();sixtyHzCPU.factor=.8;
  for(let t=3000;t<=11000;t+=1000)sixtyHzCPU.update(30,8,t,targetFrameRate(60,true));
  assert.equal(sixtyHzCPU.factor,1);
  const lowRefresh=new AdaptiveQuality();for(let t=3000;t<15000;t+=1000)lowRefresh.update(30,25,t,30);
  assert.equal(lowRefresh.factor,1,'meeting the display refresh rate must not lower quality');
});
