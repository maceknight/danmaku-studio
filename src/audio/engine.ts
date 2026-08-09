import { FPS, type Project } from '../types/dmk'

interface Voice {
  src: AudioBufferSourceNode
  gain: GainNode
}

/**
 * Preview-only audio. Sounds are scheduled against the transport clock;
 * scrubbing never triggers playback (matching NLE behaviour).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private voices: Voice[] = []

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  async load(soundId: string, file: File): Promise<void> {
    const ctx = this.context()
    const buf = await ctx.decodeAudioData(await file.arrayBuffer())
    this.buffers.set(soundId, buf)
  }

  has(soundId: string): boolean {
    return this.buffers.has(soundId)
  }

  /** Duration in frames, or 0 when nothing is loaded. */
  frames(soundId: string): number {
    const b = this.buffers.get(soundId)
    return b ? Math.round(b.duration * FPS) : 0
  }

  stop() {
    for (const v of this.voices) {
      try {
        v.src.stop()
      } catch {
        /* already stopped */
      }
      v.src.disconnect()
      v.gain.disconnect()
    }
    this.voices = []
  }

  /** (Re)schedule every audible sound relative to `fromFrame`. */
  start(project: Project, fromFrame: number, rate: number) {
    this.stop()
    if (rate <= 0) return
    const ctx = this.context()
    const now = ctx.currentTime + 0.02

    for (const snd of project.sounds) {
      const buf = this.buffers.get(snd.id)
      if (!buf || snd.endFrame < fromFrame) continue

      const startDelay = Math.max(0, (snd.startFrame - fromFrame) / FPS / rate)
      const offset = Math.max(0, (fromFrame - snd.startFrame) / FPS)
      if (offset >= buf.duration && !snd.loop) continue

      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = snd.loop
      src.playbackRate.value = rate

      const gain = ctx.createGain()
      gain.gain.value = snd.volume

      const panner = ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, snd.pan))

      src.connect(gain).connect(panner).connect(ctx.destination)

      const at = now + startDelay
      if (snd.fadeIn > 0) {
        gain.gain.setValueAtTime(0, at)
        gain.gain.linearRampToValueAtTime(snd.volume, at + snd.fadeIn / FPS)
      }
      const seconds = (snd.endFrame - Math.max(snd.startFrame, fromFrame)) / FPS / rate
      if (snd.fadeOut > 0 && seconds > 0) {
        const fadeAt = at + seconds - snd.fadeOut / FPS
        gain.gain.setValueAtTime(snd.volume, Math.max(at, fadeAt))
        gain.gain.linearRampToValueAtTime(0, at + seconds)
      }

      src.start(at, snd.loop ? offset % buf.duration : offset)
      if (seconds > 0) src.stop(at + seconds)
      this.voices.push({ src, gain })
    }
  }
}

export const audioEngine = new AudioEngine()
