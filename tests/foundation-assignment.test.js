import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeedAssignment} from './foundation-assignment.js';
import {rootsFor} from './foundation-mechanism.js';
import {FoundationFilter} from '../src/foundation-stereo.js';

test('seed assignment starts with exact pink reference pixels and holds without image history',()=>{
  const width=192,height=16,depth=new Float64Array(width*height).fill(.4),roots=rootsFor(depth,width,height,48,.33);
  const render=createSeedAssignment(),first=render(roots,width,height,1),saved=first.pixels.slice();
  const reference=new FoundationFilter().render({depth,width,height,format:'proximity'},{carrier:'pink',spacing:48,strength:.33,noiseFrame:1});
  assert.deepEqual(first.pixels,reference.pixels);
  first.pixels.fill(0);
  const held=render(roots,width,height,99);
  assert.deepEqual(held.pixels,saved);assert.equal(held.retainedPixelIdentityFraction,1);
});

test('seed assignment preserves current pairs through splits, merges and resize',()=>{
  const render=createSeedAssignment();
  for(const roots of [Uint32Array.of(3,3,3,3,7,7,7,7),Uint32Array.of(1,1,3,3,5,5,7,7),Uint32Array.of(2,3,2,3,6,7,6,7)]){
    const out=render(roots,4,2,3);
    for(let i=0;i<roots.length;i++)assert.equal(out.pixels[i],out.pixels[roots[i]]);
  }
  const small=Uint32Array.of(1,1);
  assert.deepEqual(render(small,2,1,3).pixels,createSeedAssignment()(small,2,1,3).pixels);
  assert.throws(()=>render(Uint32Array.of(0,0,0,0),2,2),/row-local/);
});
