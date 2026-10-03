import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthWalkFilter} from '../src/depthwalk.js';
function frame(t){
  const width=480,height=12;
  return {width,height,format:'proximity',depth:Float32Array.from({length:width*height},(_,i)=>Math.abs(i%width-210-t)<80?.7:.12),color:new Uint8Array(width*height*4).fill(128)};
}
test('full/window transitions discard history for all temporal patterns and both relief directions',()=>{
  for(const pattern of ['quiet','chroma','chroma-soft'])for(const invertDepth of [false,true])for(const windowPeriods of [0,2]){
    const filter=new DepthWalkFilter(),settings={pattern,invertDepth,spacing:80,surfaceDetail:.65,temporalStability:true,windowPeriods};
    for(let t=0;t<5;t++)filter.render(frame(t),settings);
    for(let t=5;t<9;t++)filter.render(frame(t),{...settings,windowPeriods:windowPeriods?0:2});
    const input=frame(9),actual=filter.render(input,settings).pixels,expected=new DepthWalkFilter().render(input,settings).pixels;
    assert.ok(actual.every((v,i)=>v===expected[i]),`stale history: ${pattern}, inverted=${invertDepth}, returning window=${windowPeriods}`);
  }
});
