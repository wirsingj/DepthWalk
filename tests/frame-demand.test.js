import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameDemand} from '../src/frame-demand.js';

test('idle frames stop after admission; changed inputs and revisits wake immediately', () => {
  const demand = new FrameDemand();
  // Includes the host version, backend, view, pose and collectible state.
  const initial = '1|gpu|stereo|0,0,0|0';
  assert.equal(demand.shouldRender(initial), true);
  demand.accepted(initial);
  for (let frame = 0; frame < 240; frame++) assert.equal(demand.shouldRender(initial), false);
  for (const changed of [
    '2|gpu|stereo|0,0,0|0',
    '1|cpu|stereo|0,0,0|0',
    '1|gpu|depth|0,0,0|0',
    '1|gpu|stereo|0,0,-0.0001|0',
    '1|gpu|stereo|0,0,0|1',
  ]) {
    assert.equal(demand.shouldRender(changed), true);
    demand.accepted(changed);
    assert.equal(demand.shouldRender(changed), false);
    assert.equal(demand.shouldRender(initial), true, 'returning to a previous state still needs a frame');
    demand.accepted(initial);
  }
});

test('rejected submissions retry current inputs without committing intermediate poses', () => {
  const demand = new FrameDemand();
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(demand.shouldRender('A'), true);
  demand.accepted('A');
  assert.equal(demand.shouldRender('B'), true);
  assert.equal(demand.shouldRender('B'), true, 'busy GPU must retry');
  assert.equal(demand.shouldRender('A'), false, 'rejected B never replaced accepted A');
  assert.equal(demand.shouldRender('C'), true, 'retry uses the newest pose');
  demand.accepted('C');
  assert.equal(demand.shouldRender('A'), true);
});

test('forced captures render unchanged inputs and failures can invalidate admission', () => {
  const demand = new FrameDemand();
  demand.accepted('A');
  assert.equal(demand.shouldRender('A', true), true);
  assert.equal(demand.shouldRender('A'), false, 'checking a capture does not mutate demand');
  demand.accepted('A');
  assert.equal(demand.shouldRender('A', true), true, 'every explicit capture must render');
  demand.reset();
  assert.equal(demand.shouldRender('A'), true, 'failed admitted work must be retryable');
  demand.accepted('A');
  assert.equal(demand.shouldRender('A'), false);
});
