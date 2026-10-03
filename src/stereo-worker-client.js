import {WorkerClient} from './worker-client.js';

function expectedStripe(frame) {
  const {width, height, inputHeight, fullHeight, yOffset, version} = frame;
  if (![width, height, inputHeight, fullHeight].every(value => Number.isSafeInteger(value) && value > 0)
      || !Number.isSafeInteger(yOffset) || yOffset < 0 || yOffset + height > fullHeight
      || inputHeight < height || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('Invalid CPU stereo stripe dimensions or version');
  }
  return {
    width, height, yOffset, version,
    inputBytes: width * inputHeight * 4,
    outputBytes: width * height * 4,
    hasColor: frame.color !== undefined && frame.color !== null,
  };
}

function validateStripe(result, expected) {
  const isBuffer = (value, length) => value instanceof ArrayBuffer && value.byteLength === length;
  if (!result || ['width', 'height', 'yOffset', 'version'].some(key => result[key] !== expected[key])
      || !isBuffer(result.buffer, expected.inputBytes)
      || !isBuffer(result.output, expected.outputBytes)
      || (expected.hasColor ? !isBuffer(result.color, expected.inputBytes) : result.color !== undefined && result.color !== null)
      || result.buffer === result.output
      || (expected.hasColor && (result.color === result.buffer || result.color === result.output))
      || !Number.isFinite(result.ms) || result.ms < 0) {
    throw new Error('Malformed CPU stereo stripe response');
  }
  return result;
}

// Owns one CPU renderer: every submitted stripe either completes or fails within
// its deadline. Validate before callers reuse returned buffers or assemble rows.
export class StereoWorkerClient {
  constructor(rawWorker) {
    this.client = new WorkerClient(rawWorker);
    this.rendering = false;
  }

  async render(frame, transfer = [], timeoutMs = 15000) {
    if (this.rendering) throw new Error('CPU stereo worker is already rendering');
    this.rendering = true;
    try {
      // Buffer transfer detaches the input, so retain scalar expectations first.
      const expected = expectedStripe(frame);
      const result = await this.client.request(frame, {transfer, timeoutMs});
      return validateStripe(result, expected);
    } catch (error) {
      this.destroy(error);
      throw error;
    } finally {
      this.rendering = false;
    }
  }

  async resetHistory() {
    try {
      const result = await this.client.request({resetHistory: true}, {timeoutMs: 15000});
      if (result !== true) throw new Error('Malformed CPU stereo reset response');
    } catch (error) {
      this.destroy(error);
      throw error;
    }
  }

  destroy(error = new Error('CPU stereo renderer closed')) {
    this.client.destroy(error);
  }
}
