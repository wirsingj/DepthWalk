import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {FoundationPreparation} from '../src/foundation-preparation.js';
import {foundationCarrierKey, validatePreparedCarrier, slicePreparedCarrier} from '../src/foundation-carrier.js';
import {createFoundationTexture} from '../src/foundation-texture.js';
import {FoundationFilter} from '../src/foundation-stereo.js';
import {StereoWorkerClient} from '../src/stereo-worker-client.js';

const specification = {width: 96, height: 17, carrier: 'pink', seed: 173};
const prepared = (spec = specification) => ({...spec, yOffset: 0, rows: spec.height,
  tones: createFoundationTexture(spec.width, spec.height, spec.carrier, spec.seed)});

class FakeWorker {
  messages = [];
  terminated = 0;
  postMessage(data) { this.messages.push(data); }
  terminate() { this.terminated++; }
  answer(result) { this.onmessage({data: {id: this.messages[0].id, result}}); }
}

function actualWorker(path) {
  const entry = new URL(path, import.meta.url).href;
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

test('off-thread preparation exactly preserves all reference carriers and deduplicates requests', async t => {
  const preparation = new FoundationPreparation(() => actualWorker('../src/foundation-preparation.worker.js'));
  t.after(() => preparation.destroy());
  for (const carrier of ['binary', 'white', 'pink']) {
    const spec = {...specification, carrier};
    const first = preparation.prepare(spec), second = preparation.prepare(spec);
    assert.equal(first, second);
    const result = await first;
    assert.deepEqual(result, prepared(spec));
    assert.equal(await preparation.prepare(spec), result);
    assert.equal(preparation.stats.bytes, spec.width * spec.height);
    assert.equal(preparation.stats.pending, false);
    assert.ok(preparation.stats.finishedAt >= preparation.stats.startedAt);
  }
  assert.equal(preparation.stats.requests, 3);
  assert.equal(preparation.stats.completed, 3);
});

test('new dimensions cancel old preparation and stale replies cannot replace the bounded cache', async () => {
  const raw = [], preparation = new FoundationPreparation(() => {const worker = new FakeWorker(); raw.push(worker); return worker;});
  const old = assert.rejects(preparation.prepare(specification), /superseded/);
  await Promise.resolve();
  const nextSpec = {...specification, height: 19}, next = preparation.prepare(nextSpec);
  await Promise.resolve();
  raw[0].answer(prepared());
  raw[1].answer(prepared(nextSpec));
  await old;
  const result = await next;
  assert.equal(preparation.cache, result);
  assert.equal(preparation.stats.preparedKey, foundationCarrierKey(nextSpec));
  assert.equal(preparation.stats.bytes, 96 * 19);
  assert.equal(preparation.stats.completed, 1);
  assert.equal(raw[0].terminated, 1);
  assert.equal(raw[1].terminated, 1);
  preparation.destroy();
});

test('same-turn supersession never starts the obsolete FFT worker', async () => {
  const raw = [], preparation = new FoundationPreparation(() => {const worker = new FakeWorker(); raw.push(worker); return worker;});
  const old = assert.rejects(preparation.prepare(specification), /superseded/);
  const nextSpec = {...specification, carrier: 'white'}, next = preparation.prepare(nextSpec);
  await Promise.resolve();
  assert.equal(raw.length, 1);
  raw[0].answer(prepared(nextSpec));
  await Promise.all([old, next]);
  preparation.destroy();
});

test('silent preparation retries once, settles, and leaves no pending job or cache', async () => {
  const raw = [], preparation = new FoundationPreparation(() => {const worker = new FakeWorker(); raw.push(worker); return worker;}, 5);
  await assert.rejects(preparation.prepare(specification), /timed out/);
  assert.equal(raw.length, 2);
  assert.equal(preparation.stats.requests, 2);
  assert.equal(preparation.stats.pending, false);
  assert.equal(preparation.pending, null);
  assert.equal(preparation.cache, null);
  assert.ok(raw.every(worker => worker.terminated === 1));
  preparation.destroy();
});

test('synchronous worker startup failures and teardown do not leave immortal preparation requests', async () => {
  let starts = 0;
  const failed = new FoundationPreparation(() => {starts++; throw new Error('Worker creation failed');});
  await assert.rejects(failed.prepare(specification), /creation failed/);
  assert.equal(starts, 2);
  assert.equal(failed.pending, null);
  assert.equal(failed.stats.pending, false);
  failed.destroy();
  const raw = new FakeWorker(), preparation = new FoundationPreparation(() => raw);
  const pending = assert.rejects(preparation.prepare(specification), /closed/);
  await Promise.resolve();
  preparation.destroy();
  await pending;
  assert.equal(raw.terminated, 1);
  await assert.rejects(preparation.prepare(specification), /closed/);
});

test('wrong-size or truncated preparation replies fail before any consumer receives samples', async () => {
  for (const corrupt of [value => ({...value, width: 95}), value => ({...value, tones: new Uint8Array(1)})]) {
    let starts = 0;
    const preparation = new FoundationPreparation(() => {
      starts++;
      const raw = new FakeWorker();
      raw.postMessage = data => {raw.messages.push(data); queueMicrotask(() => raw.answer(corrupt(prepared())));};
      return raw;
    });
    await assert.rejects(preparation.prepare(specification), /prepared foundation carrier/);
    assert.equal(starts, 2);
    assert.equal(preparation.stats.completed, 0);
    assert.equal(preparation.cache, null);
    preparation.destroy();
  }
});

test('prepared carrier slices are bounded and retain independent transferable ownership', () => {
  const original = prepared(), first = slicePreparedCarrier(original, 0, 7), second = slicePreparedCarrier(original, 7, 10);
  assert.notEqual(first.tones.buffer, second.tones.buffer);
  assert.notEqual(first.tones.buffer, original.tones.buffer);
  const received = structuredClone(first, {transfer: [first.tones.buffer]});
  assert.equal(first.tones.byteLength, 0);
  assert.equal(original.tones.byteLength, 96 * 17);
  assert.equal(second.tones.byteLength, 96 * 10);
  assert.deepEqual(received.tones, original.tones.slice(0, 96 * 7));
  assert.throws(() => slicePreparedCarrier(original, -1, 2));
  assert.throws(() => slicePreparedCarrier(original, 16, 2));
  assert.throws(() => slicePreparedCarrier(original, 1.5, 2));
  assert.throws(() => validatePreparedCarrier({...original, rows: 18}));
});

test('prepared CPU stripes preserve global seed coordinates, exact pixels, and synchronous fallback', () => {
  for (const carrier of ['binary', 'white', 'pink']) for (const seed of [173, 192]) {
    const full = prepared({...specification, carrier, seed});
    const frame = {width: 96, height: 17, format: 'proximity', depth: Float32Array.from({length: 96 * 17}, (_, i) => (i % 71) / 71)};
    const settings = {carrier, seed, spacing: 24, strength: .33};
    const expected = new FoundationFilter().render(frame, settings).pixels.slice();
    const combined = new Uint32Array(expected.length);
    for (const [yOffset, rows] of [[0, 7], [7, 10]]) {
      const filter = new FoundationFilter(), part = slicePreparedCarrier(full, yOffset, rows);
      filter.installPreparedCarrier(part);
      structuredClone(part, {transfer: [part.tones.buffer]});
      const result = filter.render({...frame, fullHeight: 17, height: rows, yOffset,
        depth: frame.depth.slice(yOffset * 96, (yOffset + rows) * 96)}, settings);
      combined.set(result.pixels, yOffset * 96);
      assert.equal(filter.textures.size, 0, 'prepared rows must not trigger an additional FFT');
      const changed = {...settings, seed: seed + 1};
      assert.deepEqual(filter.render(frame, changed).pixels, new FoundationFilter().render(frame, changed).pixels);
    }
    assert.deepEqual(combined, expected);
  }
});

test('actual CPU stripe workers consume transferred prepared rows without changing static or moving pixels', async t => {
  const specification = {width: 96, height: 17, carrier: 'pink', seed: 173};
  const preparation = new FoundationPreparation(() => actualWorker('../src/foundation-preparation.worker.js'));
  t.after(() => preparation.destroy());
  const texture = await preparation.prepare(specification);
  const depth = new Uint8Array(96 * 17 * 4);
  for (let i = 0; i < depth.length; i += 4) {depth[i] = (i / 4) % 251; depth[i + 3] = 255;}
  const clients = [0, 1].map(() => new StereoWorkerClient(actualWorker('../src/stereo.worker.js')));
  t.after(() => clients.forEach(client => client.destroy()));
  for (const noiseFrame of [0, 3, 0]) {
    const combined = new Uint32Array(96 * 17);
    for (const [index, yOffset, rows] of [[0, 0, 7], [1, 7, 10]]) {
      const buffer = depth.slice((17 - yOffset - rows) * 96 * 4, (17 - yOffset) * 96 * 4).buffer;
      const frame = {width: 96, height: rows, inputHeight: rows, fullHeight: 17, yOffset, version: 0,
        topHalo: 0, bottomHalo: 0, buffer, pattern: 'foundation-pink', spacing: 24, strength: .33,
        scale: 1, verticalFov: 60, noiseFrame, carrierContrast: .5};
      const transfer = [buffer];
      if (!clients[index].installed) {
        frame.preparedCarrier = slicePreparedCarrier(texture, yOffset, rows);
        transfer.push(frame.preparedCarrier.tones.buffer);
        clients[index].installed = true;
      }
      const result = await clients[index].render(frame, transfer);
      combined.set(new Uint32Array(result.output), yOffset * 96);
    }
    const expected = new FoundationFilter().render({width: 96, height: 17, depth, origin: 'bottom-left',
      format: 'packed-proximity-rg16'}, {carrier: 'pink', spacing: 24, strength: .33, noiseFrame, carrierContrast: .5}).pixels;
    assert.deepEqual(combined, expected);
  }
  assert.equal(preparation.stats.requests, 1);
  assert.equal(texture.tones.byteLength, 96 * 17);
  // A test-only sentinel proves that the worker consumed installed samples;
  // recomputing the normal FFT would accidentally pass reference parity alone.
  const sentinel = slicePreparedCarrier(texture, 7, 10);sentinel.tones.fill(77);
  const result = await clients[1].render({width: 96, height: 10, inputHeight: 10, fullHeight: 17,
    yOffset: 7, version: 0, topHalo: 0, bottomHalo: 0, buffer: depth.slice(0, 96 * 10 * 4).buffer,
    pattern: 'foundation-pink', spacing: 24, strength: .33, scale: 1, verticalFov: 60,
    preparedCarrier: sentinel}, [sentinel.tones.buffer]);
  assert.ok(new Uint32Array(result.output).every(pixel => pixel === 0xff4d4d4d));
});

test('GPU prepared carrier keeps owned bytes and emits the exact initial reference texture', async () => {
  const server = await createServer({root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    server: {middlewareMode: true, hmr: false, watch: null}, appType: 'custom'});
  try {
    const {DepthWalkGPU} = await server.ssrLoadModule('/src/gpu/depthwalk-gpu.js');
    const filter = new DepthWalkGPU(), writes = [];
    Object.assign(filter, {width: 96, height: 17, foundationTextures: new Map(), pipelines: [],
      device: {queue: {writeTexture: (_target, bytes) => writes.push(bytes.slice()), writeBuffer() {}}}});
    const source = prepared(), expected = source.tones.slice();
    filter.installPreparedCarrier(source);
    structuredClone(source, {transfer: [source.tones.buffer]});
    const pass = {setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {}};
    const encoder = {beginComputePass: () => pass, beginRenderPass: () => pass};
    filter.encode(encoder, {}, {pattern: 'foundation-pink', spacing: 24});
    assert.deepEqual(writes[0], expected);
    filter.encode(encoder, {}, {pattern: 'foundation-pink', spacing: 24});
    assert.equal(writes.length, 1);
    const replacement = prepared();replacement.tones.fill(77);
    filter.installPreparedCarrier(replacement);
    filter.encode(encoder, {}, {pattern: 'foundation-pink', spacing: 24});
    assert.equal(writes.length, 2);
    assert.ok(writes[1].every(value => value === 77));
    assert.throws(() => filter.installPreparedCarrier(slicePreparedCarrier(prepared(), 1, 16)), /cover the GPU frame/);
    for (let seed = 180; seed < 190; seed++) filter.installPreparedCarrier(prepared({...specification, seed}));
    assert.equal(filter.foundationTextures.size, 3);
  } finally {await server.close();}
});
