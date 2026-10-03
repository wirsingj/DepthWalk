import test from 'node:test';
import assert from 'node:assert/strict';
import {previewFrameIndices, runBenchmark, syntheticFrames, PROFILES} from '../src/debug/benchmark.js';
import {DepthWalkFilter} from '../src/depthwalk.js';
import {invertDepthFrame} from '../src/depth-direction.js';
import {evaluateObserver} from '../src/debug/observer.js';

test('1080p full sweeps bound retained native pixels while covering sequence endpoints', () => {
  const frameBytes = 1920 * 1080 * 4, budget = 128 * 1024 * 1024;
  const indices = previewFrameIndices(10, 8, frameBytes, budget);
  assert.deepEqual(indices, [0, 9]);
  assert.ok(indices.length * 8 * frameBytes <= budget);
  assert.deepEqual(previewFrameIndices(10, 8, 640 * 360 * 4, budget), [0,1,2,3,4,5,6,7,8,9]);
  assert.throws(() => previewFrameIndices(10, 8, frameBytes, 1), /budget/);
});

test('reversed lab input preserves physical geometry and evaluates reversed truth',async()=>{
  const frames=syntheticFrames({width:240,height:64,spacing:48}).slice(0,2).map(f=>({...f,invertDepth:true}));
  const profile={id:'quiet',label:'Quiet',pattern:'quiet',surfaceDetail:.35};
  const {previews}=await runBenchmark(frames,[profile],{retainFrames:true});
  const sample=previews[0].frames[0];
  const expected=new DepthWalkFilter().render(frames[0],{pattern:'quiet',surfaceDetail:.35,spacing:48,depthStrength:.5,invertDepth:true}).pixels;
  assert.deepEqual(sample.pixels,expected);
  assert.deepEqual(sample.evaluation,evaluateObserver(sample.observed,invertDepthFrame(frames[0])));
  await assert.rejects(()=>runBenchmark([frames[0],{...frames[1],invertDepth:false}],[profile]),/calibration/);
});

test('bounded previews preserve all benchmark measurements and accept unaligned color bytes', async () => {
  const frames = syntheticFrames({width: 128, height: 32, spacing: 24});
  // Host color buffers can be byte-offset views into an unrelated allocation.
  for (const frame of frames) {
    const unaligned = new Uint8Array(frame.color.length + 1).subarray(1);
    unaligned.set(frame.color); frame.color = unaligned;
  }
  const profiles = [PROFILES.at(-1)];
  const full = await runBenchmark(frames, profiles, {retainFrames: true});
  const bounded = await runBenchmark(frames, profiles, {retainFrames: true, maxPreviewBytes: 2 * 128 * 32 * 4});
  assert.equal(bounded.report.results[0].frames.length, 10);
  assert.equal(bounded.report.results[0].timeline.length, 9);
  assert.deepEqual(bounded.previews[0].frameIndices, [0, 9]);
  assert.deepEqual(bounded.previews[0].frames[1].pixels, full.previews[0].frames[9].pixels);
  for (const field of ['summary', 'accuracy', 'motion', 'colorSpread', 'frames', 'timeline', 'findings']) {
    assert.deepEqual(bounded.report.results[0][field], full.report.results[0][field], field);
  }
});

test('cancellation after the last analyzed frame prevents extra color-probe renders', async () => {
  const frames = syntheticFrames({width: 128, height: 32, spacing: 24});
  let cancelled = false, renders = 0;
  await assert.rejects(runBenchmark(frames, [PROFILES[0]], {
    render: frame => { renders++; return new Uint32Array(frame.color.slice().buffer); },
    onProgress: progress => { if (progress.frame === frames.length) cancelled = true; },
    cancelled: () => cancelled,
  }), /cancelled/);
  assert.equal(renders, 10);
});

test('benchmark rejects calibration changes and incompatible ground truth before rendering', async () => {
  for (const change of [{spacing: 96}, {strength: .3}, {format: 'proximity'}, {origin: 'unknown'}]) {
    const frames = syntheticFrames({width: 128, height: 32, spacing: 24});
    Object.assign(frames[1], change);
    let renders = 0;
    await assert.rejects(runBenchmark(frames, [PROFILES[0]], {render: () => { renders++; }}));
    assert.equal(renders, 0);
  }
});
