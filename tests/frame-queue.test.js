import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameQueue} from '../src/gpu/frame-queue.js';

function mock(){
  let submissions=0;const callbacks=[];
  const device={queue:{submit(){submissions++;callbacks.splice(0).forEach(fn=>fn());}},createCommandEncoder(){return {finish:()=>({})};}};
  return {frames:new FrameQueue(device),callbacks,get submissions(){return submissions;}};
}
test('two-frame pipeline stays bounded, exclusive readbacks drain and block rendering',()=>{
  const {frames}=mock();const a=frames.begin(),b=frames.begin();assert.ok(a&&b);
  assert.equal(frames.begin(),null);assert.equal(frames.begin(true),null);
  frames.finish(a);assert.equal(frames.begin(true),null);frames.finish(b);
  const capture=frames.begin(true);assert.ok(capture);assert.equal(frames.begin(),null);
  frames.finish(capture);assert.ok(frames.begin());
});
test('RAF polling releases submission-triggered Firefox callbacks without unbounded rendering',()=>{
  const m=mock();let completed=0;
  for(let frame=0;frame<60;frame++){
    m.frames.poll(frame*1000/60);
    const token=m.frames.begin();assert.ok(token);
    // Firefox-like idle queue: completion is only delivered on a later submit.
    m.callbacks.push(()=>{m.frames.finish(token);completed++;});
    assert.ok(m.frames.pending.size<=2);
  }
  assert.equal(completed,59);assert.equal(m.submissions,59);
  m.frames.poll(1000);assert.equal(completed,60);
  m.frames.poll(1017);assert.equal(m.submissions,60,'idle queues do not poll');
});
test('slow devices cannot accumulate real frames and duplicate polls are bounded',()=>{
  const m=mock();m.frames.begin();m.frames.begin();
  for(let i=0;i<20;i++)assert.equal(m.frames.begin(),null);
  m.frames.poll(16);m.frames.poll(16);m.frames.poll(17);
  assert.equal(m.submissions,1);assert.equal(m.frames.pending.size,2);
});
