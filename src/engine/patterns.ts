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
 * Speed multiplier that bends an otherwise round volley into a shape.
 *
 * A ring is only round because every bullet leaves at the same speed. Scale the
 * speed by direction and the same ring traces an ellipse, a polygon or a rose —
 * `psi` is the direction measured against the shape's own tilt.
 */
export function shapeSpeedFactor(p: Pattern, angleDeg: number): number {
  const psi = (angleDeg - p.shapeTilt) * D2R
  switch (p.type) {
    case 'oval': {
      const ratio = Math.max(0.05, p.ovalRatio)
      const c = Math.cos(psi)
      const s = Math.sin(psi)
      return ratio / Math.sqrt(c * c + ratio * ratio * s * s)
    }
    case 'polygon': {
      const n = Math.max(3, Math.round(p.polygonSides))
      const step = (Math.PI * 2) / n
      // distance from centre to the edge of a regular n-gon with apothem 1
      const local = ((psi % step) + step) % step
      return 1 / Math.cos(local - step / 2)
    }
    case 'rose': {
      const k = Math.max(1, Math.round(p.rosePetals))
      // keep a floor so petals pinch rather than collapse to zero speed
      return 0.35 + 0.65 * Math.abs(Math.cos(k * psi))
    }
    default:
      return 1
  }
}

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
  // 1 = as authored, -1 = mirrored left/right about the vertical axis
  const flips =
    p.mirrorMode === 'both'
      ? [1, -1]
      : p.mirrorMode === 'alternate'
        ? [shotIndex % 2 === 0 ? 1 : -1]
        : [1]
  const base =
    (p.aimPlayer ? aimAngle : p.angleBase + emitterRotation) +
    p.angleStep * p.spinDirection * shotIndex
  const wavePhase =
    p.wave !== 0 && p.wavePeriod > 0
      ? Math.sin((shotIndex / p.wavePeriod) * Math.PI * 2) * p.wave
      : 0
  const count = Math.max(1, Math.round(p.count))
  const layers = Math.max(1, Math.round(p.layers))

  for (const flip of flips)
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
        case 'oval':
        case 'polygon':
        case 'rose':
          angle += (360 / count) * i
          break
        case 'line':
        case 'whip':
          // both fire in one direction; the spread is positional / in speed
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

      // Speed comes from the un-mirrored angle: reflecting the direction while
      // keeping the speed is exactly what mirrors the shape.
      let speed = layerSpeed * shapeSpeedFactor(p, angle)
      if (p.type === 'whip') speed += p.speedStep * i
      if (p.bullet.speedRand > 0) speed += rng.jitter(p.bullet.speedRand)

      if (flip === -1) angle = 180 - angle
      const rad = angle * D2R
      let dx = Math.cos(rad) * p.radius
      let dy = Math.sin(rad) * p.radius
      if (p.type === 'line') {
        // spread the muzzle sideways instead of fanning the angles
        const offset = (i - (count - 1) / 2) * p.lineSpacing
        dx += Math.cos(rad + Math.PI / 2) * offset
        dy += Math.sin(rad + Math.PI / 2) * offset
      }

      out.push({ dx, dy, angle, speed })
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
