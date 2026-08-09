/** Minimal typings for gifenc, which ships no declaration file. */
declare module 'gifenc' {
  export type GifFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface WriteFrameOptions {
    palette?: number[][]
    delay?: number
    /** 0 = loop forever, -1 = no repeat */
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    dispose?: number
    first?: boolean
  }

  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(options?: { auto?: boolean; initialCapacity?: number }): Encoder

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: GifFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean },
  ): number[][]

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: GifFormat,
  ): Uint8Array

  export function nearestColorIndex(palette: number[][], pixel: number[]): number
}
