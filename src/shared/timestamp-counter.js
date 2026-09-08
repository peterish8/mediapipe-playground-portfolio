export class MonotonicTimestamp {
  #last = -1;

  next(candidate = performance.now()) {
    const value = Number.isFinite(candidate) ? candidate : performance.now();
    this.#last = Math.max(value, this.#last + 0.01);
    return this.#last;
  }

  reset() {
    this.#last = -1;
  }
}
