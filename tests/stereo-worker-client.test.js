import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {StereoWorkerClient} from '../src/stereo-worker-client.js';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {DepthWalkFilter} from '../src/depthwalk.js';

class FakeWorker {
  messages = [];
  terminated = 0;
  postMessage(message, transfer = []) {
    this.messages.push(structuredClone(message, {transfer}));
  }
  terminate() { this.terminated++; }
  answer(id, result) { this.onmessage({data: {id, result}}); }
}

function stripe(color = false) {
  return {
    width: 48, height: 5, inputHeight: 7, fullHeight: 9, yOffset: 2, version: 3,
    topHalo: 1, bottomHalo: 1, buffer: new ArrayBuffer(48 * 7 * 4),
    output: new ArrayBuffer(48 * 5 * 4),
    ...(color ? {color: new ArrayBuffer(48 * 7 * 4)} : {}),
    pattern: 'quiet', spacing: 12, strength: 0.33, scale: 1, grain: 1,
    surfaceDetail: 0.62, edges: 0, verticalFov: 60,
  };
}

const transfers = frame => [frame.buffer, frame.output, ...(frame.color ? [frame.color] : [])];
const reply = frame => ({
  width: frame.width, height: frame.height, yOffset: frame.yOffset, version: frame.version,
  buffer: frame.buffer, output: frame.output, color: frame.color, ms: 1,
});

test('CPU stripes validate full halo buffers after input ownership transfers', async () => {
  const raw = new FakeWorker(), client = new StereoWorkerClient(raw), frame = stripe(true);
  const pending = client.render(frame, transfers(frame));
  assert.equal(frame.buffer.byteLength, 0);
  assert.equal(frame.color.byteLength, 0);
  const expected = reply(raw.messages[0]);
  raw.answer(1, expected);
  assert.equal(await pending, expected);
  assert.equal(client.client.pending.size, 0);
  client.destroy();
});

test('malformed CPU stripes never reach assembly and close the failed worker', async () => {
  const cases = [
    result => { result.width++; },
    result => { result.height++; },
    result => { result.yOffset++; },
    result => { result.version--; },
    result => { result.buffer = new ArrayBuffer(0); },
    result => { result.output = new Uint8Array(result.output); },
    result => { result.output = new ArrayBuffer(4); },
    result => { result.color = undefined; },
    result => { result.color = new ArrayBuffer(0); },
    result => { result.color = result.buffer; },
    result => { result.ms = NaN; },
    result => { result.ms = -1; },
  ];
  for (const corrupt of cases) {
    const raw = new FakeWorker(), client = new StereoWorkerClient(raw), frame = stripe(true);
    const pending = assert.rejects(client.render(frame, transfers(frame)), /Malformed CPU stereo stripe/);
    const result = reply(raw.messages[0]);
    corrupt(result);
    raw.answer(1, result);
    await pending;
    assert.equal(raw.terminated, 1);
    assert.equal(client.client.pending.size, 0);
    assert.equal(client.rendering, false);
    await assert.rejects(client.render(stripe()), /closed/);
    client.destroy();
    assert.equal(raw.terminated, 1);
  }
});

test('unexpected color and missing result envelopes reject the stripe', async () => {
  for (const envelope of ['color', 'missing', 'invalid']) {
    const raw = new FakeWorker(), client = new StereoWorkerClient(raw), frame = stripe();
    const pending = assert.rejects(client.render(frame, transfers(frame)), /Malformed|Missing/);
    const result = reply(raw.messages[0]);
    if (envelope === 'color') raw.answer(1, {...result, color: new ArrayBuffer(48 * 7 * 4)});
    if (envelope === 'missing') raw.onmessage({data: {id: 1}});
    if (envelope === 'invalid') raw.onmessage({data: null});
    await pending;
    assert.equal(raw.terminated, 1);
    assert.equal(client.client.pending.size, 0);
  }
});

test('silent, crashed, undecodable and failed-transfer CPU work always settles', async () => {
  for (const failure of ['silent', 'crash', 'decode', 'transfer', 'worker-error']) {
    const raw = new FakeWorker(), client = new StereoWorkerClient(raw), frame = stripe();
    if (failure === 'transfer') raw.postMessage = () => { throw new Error('Transfer failed'); };
    const pending = assert.rejects(client.render(frame, transfers(frame), 10), /timed out|failed|decode/i);
    if (failure === 'crash') raw.onerror({message: 'Worker failed'});
    if (failure === 'decode') raw.onmessageerror();
    if (failure === 'worker-error') raw.onmessage({data: {id: 1, error: 'Render failed'}});
    await pending;
    assert.equal(raw.terminated, 1);
    assert.equal(client.client.pending.size, 0);
    assert.equal(client.rendering, false);
  }
});

test('request IDs ignore stale stripes and reject overlapping render submission', async () => {
  const raw = new FakeWorker(), client = new StereoWorkerClient(raw);
  const first = client.render(stripe());
  await assert.rejects(client.render(stripe()), /already rendering/);
  assert.equal(raw.messages.length, 1);
  raw.answer(1, reply(raw.messages[0]));
  await first;
  const second = client.render(stripe());
  raw.answer(1, null);
  raw.answer(100, null);
  assert.equal(client.client.pending.size, 1);
  raw.answer(2, reply(raw.messages[1]));
  await second;
  client.destroy();
});

test('teardown settles render and reset waiters exactly once', async () => {
  const raw = new FakeWorker(), client = new StereoWorkerClient(raw);
  const rendering = assert.rejects(client.render(stripe()), /Page closed/);
  const resetting = assert.rejects(client.resetHistory(), /Page closed/);
  client.destroy(new Error('Page closed'));
  await Promise.all([rendering, resetting]);
  raw.answer(1, reply(stripe()));
  raw.answer(2, true);
  client.destroy();
  assert.equal(raw.terminated, 1);
  assert.equal(client.client.pending.size, 0);
});

test('history reset requires an acknowledgement and propagates failure', async () => {
  const raw = new FakeWorker(), client = new StereoWorkerClient(raw);
  const first = client.resetHistory();
  assert.equal(raw.messages[0].resetHistory, true);
  raw.answer(1, true);
  await first;
  const failed = assert.rejects(client.resetHistory(), /Malformed CPU stereo reset/);
  raw.answer(2, false);
  await failed;
  assert.equal(raw.terminated, 1);
});

// Use the actual worker entry with real structured-clone transfers; only adapt
// the browser's event API to Node so the wire contract is tested end to end.
function realWorker() {
  const entry = new URL('../src/stereo.worker.js', import.meta.url).href;
  const thread = new Worker(`
    const {parentPort} = require('node:worker_threads');
    globalThis.self = {postMessage: (data, transfer) => parentPort.postMessage(data, transfer)};
    const ready = import(${JSON.stringify(entry)});
    parentPort.on('message', async data => { await ready; self.onmessage({data}); });
  `, {eval: true});
  const worker = {
    postMessage: (data, transfer) => thread.postMessage(data, transfer),
    terminate: () => thread.terminate(),
  };
  thread.on('message', data => worker.onmessage?.({data}));
  thread.on('error', error => worker.onerror?.(error));
  thread.on('messageerror', () => worker.onmessageerror?.());
  return worker;
}

test('actual CPU worker preserves foundation and legacy pixels with transferred halos', async t => {
  const client = new StereoWorkerClient(realWorker());
  t.after(() => client.destroy());
  for (const pattern of ['foundation-white', 'quiet']) {
    const frame = {...stripe(), pattern};
    const depth = new Uint8Array(frame.buffer);
    for (let i = 0; i < depth.length; i += 4) {
      depth[i] = i % 251;
      depth[i + 3] = 255;
    }
    const input = {
      depth, width: frame.width, height: frame.inputHeight, fullHeight: frame.fullHeight,
      yOffset: frame.yOffset - frame.topHalo, cropTop: frame.topHalo, cropBottom: frame.bottomHalo,
      format: 'packed-proximity-rg16', origin: 'bottom-left', depthRange: 22, verticalFov: 60,
    };
    const expected = pattern.startsWith('foundation-')
      ? new FoundationFilter().render(input, {carrier: 'white', spacing: 12, strength: 0.33}).pixels.slice()
      : new DepthWalkFilter().render(input, {
        pattern, spacing: 12, depthStrength: 0.33, pixelRatio: 1, dotSize: 1,
        edges: 0, surfaceDetail: 0.62,
      }).pixels.slice();
    const result = await client.render(frame, transfers(frame));
    assert.deepEqual(new Uint32Array(result.output), expected);
    await client.resetHistory();
  }
});
