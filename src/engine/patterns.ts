import type { Pattern } from '../types/dmk'
import type { Rng } from './rng'

export interface SpawnSpec {
  /** offset from the emitter origin */
  dx: number
  dy: number
  angle: number
  speed: number
}

const D2R = Math.PI / 180

/**
 * Resolve one "shot" of a pattern into concrete spawn specs.
 *
 * `shotIndex` counts how many times this pattern has already fired inside the
 * current cycle — it drives spiral/flower/wave progression. Pure and
 * deterministic so the preview and the ph3 export describe the same field.
 */
export function resolveShot(
  p: Pattern,
  shotIndex: number,
  emitterRotation: number,
  aimAngle: number,
  rng: Rng,
): SpawnSpec[] {
  const out: SpawnSpec[] = []
  const base =
    (p.aimPlayer ? aimAngle : p.angleBase + emitterRotation) +
    p.angleStep * p.spinDirection * shotIndex
  const wavePhase =
    p.wave !== 0 && p.wavePeriod > 0
      ? Math.sin((shotIndex / p.wavePeriod) * Math.PI * 2) * p.wave
      : 0
  const count = Math.max(1, Math.round(p.count))
  const layers = Math.max(1, Math.round(p.layers))

  for (let l = 0; l < layers; l++) {
    const layerSpeed = p.bullet.speed + p.layerSpeedStep * l
    for (let i = 0; i < count; i++) {
      let angle = base + wavePhase
      switch (p.type) {
        case 'circle':
        case 'ring':
        case 'flower':
        case 'burst':
        case 'spiral':
          angle += (360 / count) * i
          break
        case 'cross':
          angle += 90 * (i % 4) + Math.floor(i / 4) * (p.angleSpread / Math.max(1, count))
          break
        case 'random':
          angle += rng.jitter(p.angleSpread / 2)
          break
        default:
          // nway / aim / wave / laser / fan — evenly spaced fan
          angle += count > 1 ? -p.angleSpread / 2 + (p.angleSpread / (count - 1)) * i : 0
          break
      }
      // half-step offset between layers keeps concentric rings from stacking
      if (layers > 1 && (p.type === 'circle' || p.type === 'ring' || p.type === 'burst')) {
        angle += ((360 / count) * 0.5 * l) / layers
      }
      if (p.angleRandom > 0) angle += rng.jitter(p.angleRandom)

      const speed = layerSpeed + (p.bullet.speedRand > 0 ? rng.jitter(p.bullet.speedRand) : 0)
      const rad = angle * D2R
      out.push({
        dx: Math.cos(rad) * p.radius,
        dy: Math.sin(rad) * p.radius,
        angle,
        speed,
      })
    }
  }
  return out
}

/** True when the pattern fires on this clip-local frame. */
export function firesOn(p: Pattern, localFrame: number): boolean {
  if (!p.enabled) return false
  const t = localFrame - p.offset
  if (t < 0) return false
  return t % Math.max(1, Math.round(p.interval)) === 0
}

export function shotIndexAt(p: Pattern, localFrame: number): number {
  return Math.floor((localFrame - p.offset) / Math.max(1, Math.round(p.interval)))
}

/** Clip-local frame for a pattern, honouring its loop cycle. */
export function localFrameOf(p: Pattern, frame: number): number {
  const span = p.endFrame - p.startFrame
  const cycle = p.loop ? (p.loopInterval > 0 ? p.loopInterval : span || 1) : 0
  const raw = frame - p.startFrame
  return cycle > 0 ? raw % cycle : raw
}

export function isActiveAt(p: Pattern, frame: number): boolean {
  return p.enabled && frame >= p.startFrame && frame <= p.endFrame
}
