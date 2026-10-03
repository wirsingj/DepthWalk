// Host scheduling only: keys describe the current inputs, never stereo pixels.
// Record admission, not completion, so out-of-order work cannot rewind demand.
export class FrameDemand {
  #accepted = false;
  #key;

  shouldRender(key, force = false) {
    return force || !this.#accepted || key !== this.#key;
  }

  accepted(key) {
    this.#key = key;
    this.#accepted = true;
  }

  reset() {
    this.#accepted = false;
    this.#key = undefined;
  }
}
