import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedColor} from '../src/debug/bounded-color.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {syntheticFrames} from '../src/debug/benchmark.js';

test('unbounded transport reproduces Quiet without contour emphasis byte for byte',()=>{
  const frame=syntheticFrames()[0];
  const expected=new DepthWalkFilter().render(frame,{pattern:'quiet',edges:0,spacing:frame.spacing,depthStrength:frame.strength,surfaceDetail:.55}).pixels;
  assert.deepEqual(boundedColor(frame,{bounded:false}).pixels,expected);
});
test('bounded transport retains dense matches for constant color and caps color reach',()=>{
  const frame=syntheticFrames()[0];frame.color.fill(128);
  const a=boundedColor(frame),b=boundedColor(frame,{bounded:false});
  assert.deepEqual(a.pixels,b.pixels,'partitioning must not change the dense carrier');
  assert.ok(a.stats.maxMembers<=4&&a.stats.maxSpan<=3*frame.spacing);
  assert.ok(a.stats.colorPairFraction>.5&&a.stats.colorPairFraction<1);
  assert.deepEqual(boundedColor(frame).pixels,a.pixels,'stationary output changed');
});
