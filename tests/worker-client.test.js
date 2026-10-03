import test from 'node:test';
import assert from 'node:assert/strict';
import {DiagnosticWorker} from '../src/debug/worker-client.js';

class FakeWorker {
  messages = [];
  terminated = 0;
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated++; }
  answer(id, result) { this.onmessage({data: {id, result}}); }
}

test('diagnostic requests match IDs even when replies arrive out of order', async () => {
  const raw = new FakeWorker(), client = new DiagnosticWorker(raw);
  const first = client.request({kind: 'first'}), second = client.request({kind: 'second'});
  raw.answer(100, 'stale');
  raw.answer(2, 'second result');
  raw.answer(1, 'first result');
  assert.deepEqual(await Promise.all([first, second]), ['first result', 'second result']);
  assert.equal(client.pending.size, 0);
  client.destroy();
});

test('aborting active analysis terminates computation and rejects every waiter', async () => {
  const raw = new FakeWorker(), client = new DiagnosticWorker(raw), controller = new AbortController();
  const first = assert.rejects(client.request({}, {signal: controller.signal}), /cancelled/);
  const second = assert.rejects(client.request({}), /cancelled/);
  controller.abort(Error('User cancelled'));
  await Promise.all([first, second]);
  raw.answer(1, 'late result');
  client.destroy();
  assert.equal(raw.terminated, 1);
  assert.equal(client.pending.size, 0);
  await assert.rejects(client.request({}), /closed/);
});

test('worker crashes, bad messages, send failures and timeouts settle promises', async () => {
  for (const kind of ['crash', 'message', 'send', 'timeout']) {
    const raw = new FakeWorker(), client = new DiagnosticWorker(raw);
    if (kind === 'send') raw.postMessage = () => { throw Error('send failed'); };
    const result = assert.rejects(client.request({}, {timeoutMs: 10}), /failed|response|timed out/);
    if (kind === 'crash') raw.onerror({message: 'worker failed'});
    if (kind === 'message') raw.onmessageerror();
    await result;
    assert.equal(client.pending.size, 0);
    client.destroy();
  }
});

test('already aborted requests never dispatch work', async () => {
  const raw = new FakeWorker(), client = new DiagnosticWorker(raw), controller = new AbortController();
  controller.abort(Error('cancelled'));
  await assert.rejects(client.request({}, {signal: controller.signal}), /cancelled/);
  assert.equal(raw.messages.length, 0);
  client.destroy();
});

test('malformed worker envelopes settle active requests immediately',async()=>{
  for(const data of [null,{}, {id:1}]){
    const raw=new FakeWorker(),client=new DiagnosticWorker(raw);
    const result=assert.rejects(client.request({}),/Malformed|Missing/);
    raw.onmessage({data});await result;assert.equal(client.pending.size,0);client.destroy();
  }
});
