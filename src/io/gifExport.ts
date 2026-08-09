import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { FPS } from '../types/dmk'

export interface GifOptions {
  startFrame: number
  endFrame: number
  /** capture every Nth frame — 3 gives 20fps, which GIF players honour */
  frameStep: number
  /** output width in pixels; height follows the stage aspect ratio */
  width: number
  /** loop forever (Discord autoplays looping GIFs) */
  loop: boolean
}

export interface GifProgress {
  current: number
  total: number
  phase: 'capture' | 'encode'
}

/** GIF delays are stored in centiseconds, and players clamp anything under 2. */
export function gifDelayMs(frameStep: number): number {
  return Math.max(20, Math.round((frameStep / FPS) * 100) * 10)
}

export function estimateFrames(o: GifOptions): number {
  return Math.max(1, Math.floor((o.endFrame - o.startFrame) / Math.max(1, o.frameStep)) + 1)
}

/**
 * Encodes already-captured RGBA frames into a GIF blob.
 *
 * Quantising each frame separately keeps gradients clean at the cost of a
 * per-frame local palette; danmaku is mostly flat colour so the size penalty is
 * small and it avoids a global palette washing out differently-coloured shots.
 */
export async function encodeGif(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  opts: GifOptions,
  onProgress?: (p: GifProgress) => void,
): Promise<Blob> {
  const gif = GIFEncoder()
  const delay = gifDelayMs(opts.frameStep)

  for (let i = 0; i < frames.length; i++) {
    const data = frames[i]
    const palette = quantize(data, 256, { format: 'rgb565' })
    const index = applyPalette(data, palette, 'rgb565')
    gif.writeFrame(index, width, height, {
      palette,
      delay,
      repeat: opts.loop ? 0 : -1,
    })
    onProgress?.({ current: i + 1, total: frames.length, phase: 'encode' })
    // keep the UI responsive between frames
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0))
  }

  gif.finish()
  return new Blob([gif.bytesView() as unknown as BlobPart], { type: 'image/gif' })
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** Discord's free-tier upload ceiling. */
export const DISCORD_LIMIT = 10 * 1024 * 1024
