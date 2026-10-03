import test from 'node:test';
import assert from 'node:assert/strict';
import {correlationGradient,synthesizeFeatures} from '../src/debug/feature-synthesis.js';
import {syntheticFrames} from '../src/debug/benchmark.js';

test('feature correspondence permits different means and contrast without demanding equal RGB',()=>{
  const a=[30,60,35,80,10],b=a.map(v=>2*v+15),r=correlationGradient(a,b);
  assert.ok(Math.abs(r.correlation-1)<1e-12);
  assert.ok([...r.da,...r.db].every(v=>Math.abs(v)<1e-12));
});
test('correlation derivatives agree with an independent finite difference',()=>{
  const a=[30,60,35,80,10],b=[70,20,45,90,5],r=correlationGradient(a,b),epsilon=.001;
  for(let side=0;side<2;side++)for(let i=0;i<a.length;i++){
    const plus=[a.slice(),b.slice()],minus=[a.slice(),b.slice()];plus[side][i]+=epsilon;minus[side][i]-=epsilon;
    const numeric=(correlationGradient(...plus).correlation-correlationGradient(...minus).correlation)/(2*epsilon);
    assert.ok(Math.abs(numeric-(side?r.db:r.da)[i])<1e-8);
  }
});
test('feature synthesis leaves textureless evidence uncertain and holds stationary output',()=>{
  const frame=syntheticFrames({width:120,height:48,spacing:24})[0],initial=new Uint32Array(120*48).fill(0xff808080);
  assert.equal(correlationGradient([1,1,1],[2,2,2]).valid,false);
  const a=synthesizeFeatures(frame,initial);assert.ok(a.patches>0);assert.deepEqual(a.pixels,initial);
  assert.deepEqual(synthesizeFeatures(frame,initial).pixels,a.pixels);
});
