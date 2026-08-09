import { sampleChannel, type Modifier, type Pattern, type Project } from '../types/dmk'
import { firesOn, isActiveAt, localFrameOf, resolveShot, shotIndexAt } from './patterns'
import { BulletPool } from './pool'
import { Rng } from './rng'
import type { EmitterMarker, SimBullet, SimSnapshotView } from './types'

const D2R = Math.PI / 180
const R2D = 180 / Math.PI
const SNAPSHOT_STRIDE = 60
const OUT_MARGIN = 96

interface CompiledPattern {
  pattern: Pattern
  emitterId: string
}

interface CompiledProject {
  patterns: CompiledPattern[]
  project: Project
}

interface Snapshot {
  frame: number
  rngState: number
  bullets: SimBullet[]
}

function hexToInt(hex: string): number {
  const h = hex.replace('#', '')
  return parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0xffffff
}

function compile(project: Project): CompiledProject {
  const patterns: CompiledPattern[] = []
  for (const emitter of project.emitters) {
    if (!emitter.visible) continue
    for (const p of emitter.patterns) patterns.push({ pattern: p, emitterId: emitter.id })
  }
  return { patterns, project }
}

/**
 * Frame-accurate danmaku simulator.
 *
 * Deterministic by construction: the whole field at frame N is a pure function
 * of (project, seed, N). Seeking replays from the nearest snapshot, so a scrub
 * costs at most SNAPSHOT_STRIDE steps instead of a full replay.
 */
export class Simulator {
  private compiled: CompiledProject
  private pool: BulletPool
  private rng: Rng
  private snapshots: Snapshot[] = []
  private emitterMarkers: EmitterMarker[] = []
  frame = -1
  lastStepMs = 0

  constructor(project: Project, capacity = 12000) {
    this.compiled = compile(project)
    this.pool = new BulletPool(capacity)
    this.rng = new Rng(project.settings.seed)
    this.reset()
  }

  get project() {
    return this.compiled.project
  }

  get bulletCount() {
    return this.pool.activeCount
  }

  /** Rebuild from an edited project and invalidate every cached snapshot. */
  setProject(project: Project) {
    this.compiled = compile(project)
    this.invalidate()
  }

  invalidate() {
    this.reset()
  }

  reset() {
    this.pool.clear()
    this.rng.reset(this.compiled.project.settings.seed)
    this.frame = -1
    this.snapshots.length = 0
  }

  /** Advance / rewind to `target` and return the renderable view. */
  seek(target: number): SimSnapshotView {
    const t0 = performance.now()
    const goal = Math.max(0, Math.round(target))
    if (goal < this.frame) {
      const snap = this.nearestSnapshot(goal)
      if (snap) {
        this.pool.restore(snap.bullets)
        this.rng.setState(snap.rngState)
        this.frame = snap.frame
      } else {
        this.pool.clear()
        this.rng.reset(this.compiled.project.settings.seed)
        this.frame = -1
      }
    }
    while (this.frame < goal) this.step()
    this.lastStepMs = performance.now() - t0
    return this.view()
  }

  private nearestSnapshot(frame: number): Snapshot | null {
    let best: Snapshot | null = null
    for (const s of this.snapshots) {
      if (s.frame <= frame && (!best || s.frame > best.frame)) best = s
    }
    return best
  }

  private saveSnapshot() {
    if (this.frame % SNAPSHOT_STRIDE !== 0) return
    if (this.snapshots.some((s) => s.frame === this.frame)) return
    this.snapshots.push({
      frame: this.frame,
      rngState: this.rng.getState(),
      bullets: this.pool.snapshot(),
    })
    if (this.snapshots.length > 64) this.snapshots.shift()
  }

  /** One 1/60s tick: spawn, then integrate. */
  step() {
    this.frame += 1
    this.spawn(this.frame)
    this.integrate()
    this.saveSnapshot()
  }

  // -------------------------------------------------------------------------

  private spawn(frame: number) {
    const { settings, emitters } = this.compiled.project
    this.emitterMarkers.length = 0
    const state = new Map<string, { x: number; y: number; rotation: number }>()

    for (const e of emitters) {
      const st = {
        x: sampleChannel(e.keys.x, frame, e.x),
        y: sampleChannel(e.keys.y, frame, e.y),
        rotation: sampleChannel(e.keys.rotation, frame, e.rotation),
      }
      state.set(e.id, st)
      this.emitterMarkers.push({
        id: e.id,
        name: e.name,
        x: st.x,
        y: st.y,
        rotation: st.rotation,
        active: e.visible && e.patterns.some((p) => isActiveAt(p, frame)),
      })
    }

    // Iterating the compiled list keeps the pattern index O(1) for bullets.
    for (let idx = 0; idx < this.compiled.patterns.length; idx++) {
      const { pattern: p, emitterId } = this.compiled.patterns[idx]
      if (!isActiveAt(p, frame)) continue
      const st = state.get(emitterId)
      if (!st) continue
      const local = localFrameOf(p, frame)
      if (!firesOn(p, local)) continue
      const aim = Math.atan2(settings.playerY - st.y, settings.playerX - st.x) * R2D
      for (const s of resolveShot(p, shotIndexAt(p, local), st.rotation, aim, this.rng)) {
        this.emit(p, idx, st.x + s.dx, st.y + s.dy, s.angle, s.speed, 0)
      }
    }
  }

  private emit(
    p: Pattern,
    patternIdx: number,
    x: number,
    y: number,
    angle: number,
    speed: number,
    depth: number,
  ): SimBullet | null {
    const b = this.pool.acquire()
    if (!b) return null
    const bd = p.bullet
    b.kind = p.type === 'laser' ? 1 : 0
    b.x = x
    b.y = y
    b.px = x
    b.py = y
    b.angle = angle
    b.speed = speed
    b.accel = bd.accel
    b.maxSpeed = bd.maxSpeed
    b.angularVelocity = bd.angularVelocity
    b.gvx = 0
    b.gvy = 0
    b.age = 0
    b.life = bd.life
    b.scale = bd.scale
    b.baseScale = bd.scale
    b.alpha = 1
    b.color = hexToInt(bd.color)
    b.additive = bd.blend === 'add'
    b.delay = bd.delay
    b.hitbox = bd.hitboxRadius
    b.shape = bd.shape
    b.laserLength = p.laserLength
    b.laserWidth = p.laserWidth
    b.patternIdx = patternIdx
    b.depth = depth
    b.fired = 0
    return b
  }

  private integrate() {
    const { settings } = this.compiled.project
    const halfW = settings.stageWidth / 2 + OUT_MARGIN
    const halfH = settings.stageHeight / 2 + OUT_MARGIN
    const items = this.pool.items

    for (let i = 0; i < items.length; i++) {
      const b = items[i]
      if (!b.active) continue

      const pat = b.patternIdx >= 0 ? this.compiled.patterns[b.patternIdx]?.pattern : null
      if (pat && pat.modifiers.length > 0) this.applyModifiers(b, i, pat.modifiers)
      if (!b.active) continue

      if (b.delay > 0) {
        b.delay -= 1
        b.age += 1
        continue
      }

      b.px = b.x
      b.py = b.y
      b.angle += b.angularVelocity
      if (b.accel !== 0) {
        b.speed += b.accel
        if (b.accel > 0 && b.speed > b.maxSpeed) b.speed = b.maxSpeed
        if (b.accel < 0 && b.speed < -b.maxSpeed) b.speed = -b.maxSpeed
      }
      const rad = b.angle * D2R
      b.x += Math.cos(rad) * b.speed + b.gvx
      b.y += Math.sin(rad) * b.speed + b.gvy
      b.age += 1

      if (
        b.age >= b.life ||
        b.alpha <= 0 ||
        b.x < -halfW ||
        b.x > halfW ||
        b.y < -halfH ||
        b.y > halfH
      ) {
        this.pool.release(i)
      }
    }
  }

  private applyModifiers(b: SimBullet, index: number, mods: Modifier[]) {
    for (let m = 0; m < mods.length && m < 30; m++) {
      const mod = mods[m]
      if (!mod.enabled) continue
      const age = b.age
      const within =
        age >= mod.at && (mod.duration <= 0 ? age === mod.at : age < mod.at + mod.duration)
      if (!within) continue
      const bit = 1 << m
      const once = mod.duration <= 0

      switch (mod.type) {
        case 'rotate':
          b.angle += mod.amount
          break
        case 'accel':
          b.speed += mod.amount
          if (Math.abs(b.speed) > b.maxSpeed) b.speed = Math.sign(b.speed) * b.maxSpeed
          break
        case 'gravity':
          b.gvx += mod.amount2
          b.gvy += mod.amount
          break
        case 'fade': {
          const span = Math.max(1, mod.duration)
          b.alpha += (mod.amount - b.alpha) / Math.max(1, mod.at + span - age)
          break
        }
        case 'scale': {
          const span = Math.max(1, mod.duration)
          b.scale += (mod.amount * b.baseScale - b.scale) / Math.max(1, mod.at + span - age)
          break
        }
        case 'random':
          if (!(b.fired & bit)) {
            b.fired |= bit
            b.angle += this.rng.jitter(mod.amount2)
            b.speed += this.rng.jitter(mod.amount)
          }
          break
        case 'split':
          if (!(b.fired & bit) && b.depth === 0) {
            b.fired |= bit
            const pat = this.compiled.patterns[b.patternIdx]?.pattern
            if (pat) {
              const n = Math.max(2, Math.round(mod.amount))
              const spread = mod.amount2
              for (let k = 0; k < n; k++) {
                const a = b.angle - spread / 2 + (spread / Math.max(1, n - 1)) * k
                const child = this.emit(pat, b.patternIdx, b.x, b.y, a, b.speed, 1)
                if (child) child.delay = 0
              }
            }
          }
          break
        case 'destroy':
          this.pool.release(index)
          return
        case 'wait':
          break
      }
      if (once) b.fired |= bit
    }
  }

  view(): SimSnapshotView {
    const bullets: SimBullet[] = []
    const items = this.pool.items
    for (let i = 0; i < items.length; i++) {
      if (items[i].active) bullets.push(items[i])
    }
    return {
      frame: this.frame,
      bullets,
      emitters: this.emitterMarkers,
      bulletCount: this.pool.activeCount,
    }
  }
}
