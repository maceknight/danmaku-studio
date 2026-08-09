/**
 * Deterministic RNG (mulberry32). Determinism is mandatory: scrubbing to frame
 * N re-simulates from 0 and must reproduce the exact same bullet field.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  reset(seed: number) {
    this.state = seed >>> 0
  }

  getState(): number {
    return this.state
  }

  setState(state: number) {
    this.state = state >>> 0
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Symmetric jitter in [-amount, amount]. */
  jitter(amount: number): number {
    return (this.next() * 2 - 1) * amount
  }
}
