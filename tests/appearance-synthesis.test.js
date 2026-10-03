import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesizeAppearance,solveContrast} from '../src/debug/appearance-synthesis.js';
import {syntheticFrames} from '../src/debug/benchmark.js';

test('appearance solver reduces its objective without modifying inputs or introducing frame randomness',()=>{
  const frame=syntheticFrames({width:240,height:96,spacing:48})[0];
  const carrier=new Uint32Array(frame.width*frame.height).fill(0xff808080),source=frame.color.slice();
  const a=synthesizeAppearance(frame,carrier),b=synthesizeAppearance(frame,carrier);
  assert.ok(a.after.total<a.before.total);
  assert.ok(a.after.matching<a.before.matching);
  assert.deepEqual(a.pixels,b.pixels);assert.deepEqual(frame.color,source);
  const flat=synthesizeAppearance(frame,carrier,{weight:0});
  assert.deepEqual(new Uint8Array(flat.pixels.buffer),frame.color);
  assert.throws(()=>synthesizeAppearance(frame,carrier,{iterations:Infinity}));
});

test('projected ownership variants retain deterministic descent and identify conflicts',()=>{
  const frame=syntheticFrames({width:240,height:96,spacing:48})[0];
  const carrier=new Uint32Array(frame.width*frame.height).fill(0xff808080);
  for(const selective of [false,true]){
    const options={projected:true,selective},a=synthesizeAppearance(frame,carrier,options);
    assert.ok(a.conflicts>0&&a.after.total<=a.before.total);
    assert.deepEqual(a.pixels,synthesizeAppearance(frame,carrier,options).pixels);
  }
});

test('contrast constraints preserve constant surface means while reducing matching objective',()=>{
  const target=Float32Array.from({length:24},(_,i)=>Math.floor(i/3)<4?40:200);
  const result=solveContrast(target,[0,4,1,5,2,6],[1,1,1],8,2,64);
  assert.equal(result.before.matching,0);
  assert.equal(result.after.total,0);
  const textured=target.slice();textured[3]=100;
  const adjusted=solveContrast(textured,[0,4,1,5,2,6],[1,1,1],8,2,64);
  assert.ok(adjusted.after.total<adjusted.before.total);
  assert.ok(adjusted.after.matching<adjusted.before.matching);
});
