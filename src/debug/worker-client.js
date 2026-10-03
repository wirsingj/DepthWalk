// Owns a diagnostic worker and all promises waiting on it. No task may hang
// after cancellation, startup failure, deserialization failure or page teardown.
export class DiagnosticWorker {
  constructor(worker) {
    this.worker = worker;
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
    worker.onmessage = ({data}) => {
      if(!data||!Number.isSafeInteger(data.id)){
        this.destroy(new Error('Malformed diagnostic worker response'));return;
      }
      const task = this.pending.get(data.id);
      if (!task) return;
      if (data.error) task.reject(new Error(data.error));
      else if(!Object.hasOwn(data,'result'))task.reject(new Error('Missing diagnostic worker result'));
      else task.resolve(data.result);
    };
    worker.onerror = event => this.destroy(new Error(event.message || 'Diagnostic worker failed'));
    worker.onmessageerror = () => this.destroy(new Error('Could not decode diagnostic worker response'));
  }

  request(payload, {transfer = [], signal, timeoutMs = 60000} = {}) {
    if (this.closed) return Promise.reject(new Error('Diagnostic worker is closed'));
    if (signal?.aborted) return Promise.reject(signal.reason || new Error('Diagnostic cancelled'));
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Invalid worker timeout'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const finish = (complete, value) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        this.pending.delete(id);
        complete(value);
      };
      // A worker cannot interrupt synchronous computation; terminate it on abort.
      const abort = () => this.destroy(signal.reason || new Error('Diagnostic cancelled'));
      const timer = setTimeout(() => this.destroy(new Error('Diagnostic worker timed out')), timeoutMs);
      this.pending.set(id, {
        resolve: value => finish(resolve, value),
        reject: error => finish(reject, error),
      });
      signal?.addEventListener('abort', abort, {once: true});
      try { this.worker.postMessage({...payload, id}, transfer); }
      catch (error) { this.pending.get(id).reject(error); }
    });
  }

  destroy(error = new Error('Diagnostic cancelled')) {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
  }
}
