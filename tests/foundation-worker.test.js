import test from 'node:test';
import assert from 'node:assert/strict';

test('foundation worker returns bounded-client envelopes and retains held depth between treatments', async () => {
  const previousSelf=globalThis.self,messages=[];
  globalThis.self={postMessage:(data,transfer)=>messages.push({data,transfer})};
  try{
    await import('./foundation.worker.js');
    self.onmessage({data:{id:1,settings:{carrier:'binary',spacing:16}}});
    assert.match(messages.pop().data.error,/No depth frame/);
    const width=64,height=8,frame={width,height,format:'proximity',depth:new Float64Array(width*height).fill(.3)};
    self.onmessage({data:{id:2,frame,settings:{carrier:'binary',spacing:16}}});
    const first=messages.pop();
    assert.equal(first.data.id,2);
    assert.equal(first.data.result.width,width);assert.equal(first.data.result.height,height);
    assert.equal(first.data.result.pixels.length,width*height);
    assert.ok(first.data.result.pixels instanceof Uint32Array);
    assert.ok(Number.isFinite(first.data.result.ms)&&first.data.result.ms>=0);
    assert.deepEqual(first.transfer,[first.data.result.pixels.buffer]);
    self.onmessage({data:{id:3,settings:{carrier:'white',spacing:16}}});
    const next=messages.pop();
    assert.equal(next.data.id,3);
    assert.equal(next.data.result.pixels.length,width*height);
    assert.notDeepEqual(next.data.result.pixels,first.data.result.pixels);
    assert.notEqual(next.data.result.pixels.buffer,first.data.result.pixels.buffer);
    self.onmessage({data:{id:4,settings:{carrier:'invalid',spacing:16}}});
    const failed=messages.pop();
    assert.equal(failed.data.id,4);assert.equal(typeof failed.data.error,'string');
    assert.equal(failed.data.result,undefined);
  }finally{
    if(previousSelf===undefined)delete globalThis.self;else globalThis.self=previousSelf;
  }
});
