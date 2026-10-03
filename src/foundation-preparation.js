import {WorkerClient} from './worker-client.js';
import {foundationCarrierKey, validatePreparedCarrier} from './foundation-carrier.js';

// One live request and one retained carrier. A changed size/treatment cancels
// obsolete FFT work instead of extending a queue during rapid control changes.
export class FoundationPreparation {
  constructor(createWorker, timeoutMs = 15000) {
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
    this.closed = false;
    this.generation = 0;
    this.cache = null;
    this.pending = null;
    this.stats = {requestedKey: null, preparedKey: null, pending: false, requests: 0, completed: 0, startedAt: null, finishedAt: null, bytes: 0};
  }

  prepare({width, height, carrier = 'pink', seed = 173}) {
    if (this.closed) return Promise.reject(new Error('Foundation preparation is closed'));
    const specification = {width, height, carrier, seed};
    let key;
    try { key = foundationCarrierKey(specification); }
    catch (error) { return Promise.reject(error); }
    if (this.pending?.key === key) return this.pending.promise;
    if (this.cache && validatePreparedCarrier(this.cache) === key && !this.pending) return Promise.resolve(this.cache);
    this.client?.destroy(new Error('Foundation preparation superseded'));
    const generation = ++this.generation;
    this.cache = null;
    Object.assign(this.stats, {requestedKey: key, preparedKey: null, pending: true, startedAt: performance.now(), finishedAt: null, bytes: 0});
    const promise = Promise.resolve().then(() => this.run(specification, key, generation));
    this.pending = {key, promise};
    return promise;
  }

  async run(specification, key, generation) {
    try {
      if (generation !== this.generation || this.closed) throw new Error('Foundation preparation superseded');
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          this.client = new WorkerClient(this.createWorker());
          this.stats.requests++;
          const result = await this.client.request(specification, {timeoutMs: this.timeoutMs});
          if (generation !== this.generation || this.closed) throw new Error('Foundation preparation superseded');
          if (validatePreparedCarrier(result) !== key || result.yOffset !== 0 || result.rows !== specification.height) {
            throw new Error('Mismatched prepared foundation carrier');
          }
          this.cache = result;
          this.stats.completed++;
          Object.assign(this.stats, {preparedKey: key, finishedAt: performance.now(), bytes: result.tones.byteLength});
          return result;
        } catch (error) {
          if (generation !== this.generation || this.closed) throw error;
          this.client?.destroy(error);
          if (attempt === 1) throw error;
        }
      }
    } finally {
      if (generation === this.generation) {
        this.client?.destroy();
        this.client = null;
        this.pending = null;
        this.stats.pending = false;
      }
    }
  }

  destroy() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.client?.destroy(new Error('Foundation preparation closed'));
    this.client = this.pending = this.cache = null;
    this.stats.pending = false;
    this.stats.bytes = 0;
  }
}
