import test from 'node:test';
import assert from 'node:assert/strict';
import {classColorBound,analyzeColorConstraints} from '../src/debug/color-constraints.js';
import {syntheticFrames} from '../src/debug/benchmark.js';

test('transitive exact colors have an unavoidable least-squares error, even without texture',()=>{
  const target=Float64Array.from([0,0,0,255,255,255,0,0,0]);
  const result=classColorBound(target,Int32Array.from([2,2,2]));
  assert.deepEqual([...result.fit],Array(9).fill(85));
  assert.equal(result.squaredError,130050);
  for(const candidate of [0,30,84,86,150,255]){
    const error=[...target].reduce((sum,v)=>sum+(v-candidate)**2,0);
    assert.ok(error>=result.squaredError);
  }
  assert.equal(classColorBound(target,Int32Array.from([0,1,2])).rmse,0);
});

test('color feasibility identifies competing demands and respects input row origin',()=>{
  const frame=syntheticFrames({width:240,height:96,spacing:48})[0];
  const a=analyzeColorConstraints(frame);
  assert.ok(a.exactRGBSourceRMSELowerBound>0&&a.conflictingEndpointFraction>0);
  assert.ok(a.maxClassSpanPixels>frame.spacing*3);
  const depth=new Uint8Array(frame.depth.length),color=new Uint8Array(frame.color.length),stride=frame.width*4;
  for(let y=0;y<frame.height;y++)for(const [src,dst] of [[frame.depth,depth],[frame.color,color]])dst.set(src.subarray(y*stride,(y+1)*stride),(frame.height-1-y)*stride);
  assert.deepEqual(analyzeColorConstraints({...frame,depth,color,origin:'bottom-left'}),a);
});
