import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {stereoWindow,cropColumns} from '../src/stereo-window.js';

const width=720,height=32;
function fixture(){
  const depth=Float32Array.from({length:width*height},(_,i)=>Math.abs(i%width-width/2)<40?4:20);
  const color=Uint8Array.from({length:width*height*4},(_,i)=>i%4===3?255:(i*17)%220);
  return {width,height,depth,color};
}
test('bounded synthesis isolates color classes and preserves the original outside',()=>{
  for(const windowPeriods of [2,3,4])for(const pixelRatio of [.5,1,1.5]){
    const frame=fixture(),settings={pattern:'quiet',windowPeriods,pixelRatio},region=stereoWindow(width,120,pixelRatio,windowPeriods);
    const actual=new DepthWalkFilter().render(frame,settings).pixels;
    const changed={...frame,color:frame.color.slice()};
    for(let i=0;i<width*height;i++)if(i%width<region.left||i%width>=region.right)changed.color.fill(0,i*4,i*4+3);
    const other=new DepthWalkFilter().render(changed,settings).pixels;
    for(let i=0;i<actual.length;i++){
      if(i%width>=region.left&&i%width<region.right)assert.equal(actual[i],other[i],'outside color leaked into stereo classes');
      else assert.equal(actual[i],new Uint32Array(frame.color.buffer)[i],'outside image changed');
    }
    assert.equal(region.width/pixelRatio,windowPeriods*120);
  }
});
test('bounded synthesis handles reversed input and halo row crops',()=>{
  const frame=fixture(),settings={pattern:'quiet',windowPeriods:3},filter=new DepthWalkFilter();
  const full=filter.render(frame,settings).pixels.slice(),reverse=a=>{const stride=a.length/height,out=a.slice();for(let y=0;y<height;y++)out.set(a.subarray(y*stride,(y+1)*stride),(height-1-y)*stride);return out;};
  assert.deepEqual(filter.render({...frame,origin:'bottom-left',depth:reverse(frame.depth),color:reverse(frame.color)},settings).pixels,full);
  assert.deepEqual(filter.render({...frame,cropTop:4,cropBottom:5},settings).pixels,full.subarray(4*width,(height-5)*width));
});
test('window boundaries limit the solver, rather than cropping a full-frame stereogram',()=>{
  const frame=fixture(),region=stereoWindow(width,120,1,3),filter=new DepthWalkFilter();
  const full=filter.render(frame,{pattern:'quiet'}).pixels.slice();
  const bounded=filter.render(frame,{pattern:'quiet',windowPeriods:3}).pixels;
  const a=cropColumns(full,width,height,region.left,region.width),b=cropColumns(bounded,width,height,region.left,region.width);
  assert.ok(a.some((v,i)=>v!==b[i]));
  assert.throws(()=>filter.render(frame,{windowPeriods:1}),/window/);
  assert.throws(()=>filter.render({...frame,color:undefined},{windowPeriods:4}),/scene color/);
});
