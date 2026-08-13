import {
  applyEase,
  sampleChannel,
  type Modifier,
  type Pattern,
  type Project,
} from '../types/dmk'
import { splitChildOf } from '../types/factory'
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
  /**
   * Injected by the host so bullets can carry the numeric ph3 shot id without
   * the engine having to know anything about sprite sheets or the DOM.
   */
  resolveShotId: (shotDataId: string) => number = () => 0
  /**
   * Where the player currently is. Play mode swaps this for the live,
   * keyboard-driven position; the default just mirrors the project setting.
   */
  playerPosition: () => { x: number; y: number } = () => ({
    x: this.compiled.project.settings.playerX,
    y: this.compiled.project.settings.playerY,
  })

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
    const { emitters } = this.compiled.project
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
      const player = this.playerPosition()
      const aim = Math.atan2(player.y - st.y, player.x - st.x) * R2D
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
    const isLaser = p.type === 'laser'
    const loose = isLaser && p.laserType === 'loose'
    b.kind = isLaser ? (loose ? 2 : 1) : 0
    b.x = x
    b.y = y
    b.px = x
    b.py = y
    b.angle = angle
    // an anchored straight laser never moves; its "delay" is the telegraph
    b.speed = b.kind === 1 ? 0 : speed
    b.accel = b.kind === 1 ? 0 : bd.accel
    b.maxSpeed = bd.maxSpeed
    b.angularVelocity = b.kind === 1 ? 0 : bd.angularVelocity
    b.gvx = 0
    b.gvy = 0
    b.age = 0
    b.travel = 0
    b.rampFrom = speed
    b.rampAt = -1
    b.telegraph = b.kind === 1 ? Math.max(0, Math.round(p.laserDelay)) : 0
    // `life` is measured from materialisation, so the telegraph is added on top
    b.life = bd.life + b.telegraph
    b.scale = bd.scale
    b.baseScale = bd.scale
    b.alpha = 1
    b.color = hexToInt(bd.color)
    b.additive = bd.blend === 'add'
    b.delay = b.kind === 1 ? b.telegraph : bd.delay
    b.hitbox = bd.hitboxRadius
    b.shape = bd.shape
    b.shotId = this.resolveShotId(bd.shotDataId)
    b.laserLength = p.laserLength
    b.laserWidth = p.laserWidth
    b.patternIdx = patternIdx
    b.depth = depth
    b.fired = 0
    b.wallHits = 0
    b.wasOutside = false
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
      // Split children carry no modifiers. This matches the export: the
      // generated split code calls CreateShotA1 without attaching a control
      // task, so children in ph3 have no behaviour either. It also stops the
      // parent's `destroy` from killing the children the moment they appear.
      if (pat && pat.modifiers.length > 0 && b.depth === 0) {
        this.applyModifiers(b, i, pat.modifiers)
      }
      if (!b.active) continue

      if (b.delay > 0) {
        b.delay -= 1
        b.age += 1
        // an anchored laser still ages out during its telegraph
        if (b.kind === 1 && b.age >= b.life) this.pool.release(i)
        continue
      }

      b.px = b.x
      b.py = b.y
      b.angle += b.angularVelocity

      // Pattern-level speed ramp wins over raw acceleration when it is armed.
      const bd = pat?.bullet
      if (bd && bd.rampDuration > 0) {
        const t = (b.age - bd.rampDelay) / bd.rampDuration
        if (t >= 0) {
          if (b.rampAt < 0) {
            b.rampAt = b.age
            b.rampFrom = b.speed
          }
          b.speed = b.rampFrom + (bd.rampTarget - b.rampFrom) * applyEase(t, bd.rampEase)
        }
      } else if (b.accel !== 0) {
        b.speed += b.accel
        if (b.accel > 0 && b.speed > b.maxSpeed) b.speed = b.maxSpeed
        if (b.accel < 0 && b.speed < -b.maxSpeed) b.speed = -b.maxSpeed
      }
      const rad = b.angle * D2R
      b.x += Math.cos(rad) * b.speed + b.gvx
      b.y += Math.sin(rad) * b.speed + b.gvy
      b.travel += Math.abs(b.speed)
      b.age += 1

      // Wall contact — right after the position update, before the out-of-bounds
      // cull, and using the stage rect itself (not OUT_MARGIN, which is a
      // separate "how far off-screen before we bother culling" allowance).
      // Anchored lasers (kind 1) never move, so the check is meaningless for them.
      // Detection is separate from response: `wallHits` counts every crossing
      // even when the bullet flies straight through, because a modifier can be
      // triggered by wall contact without the bullet reacting to the wall
      // itself. Only the *response* is gated on wallBehavior.
      const behavior = bd?.wallBehavior ?? 'none'
      if (b.kind !== 1) {
        const hw = settings.stageWidth / 2
        const hh = settings.stageHeight / 2
        const outside = b.x < -hw || b.x > hw || b.y < -hh || b.y > hh
        // count the crossing, not every frame spent outside
        const crossed = outside && !b.wasOutside

        if (crossed) b.wallHits += 1

        if (outside && behavior !== 'none') {
          // left/right and top/bottom are handled separately — a corner hit can
          // trip both in the same frame.
          if (b.x < -hw || b.x > hw) {
            if (behavior === 'bounce') {
              b.x = b.x < -hw ? -hw : hw
              b.angle = 180 - b.angle
            } else if (behavior === 'wrap') {
              b.x = b.x < -hw ? hw : -hw
            }
          }
          if (b.y < -hh || b.y > hh) {
            if (behavior === 'bounce') {
              b.y = b.y < -hh ? -hh : hh
              b.angle = -b.angle
            } else if (behavior === 'wrap') {
              b.y = b.y < -hh ? hh : -hh
            }
          }
          if (behavior === 'vanish') {
            this.pool.release(i)
            continue
          }
          // "wallBounces" reads as "how many times it's allowed to bounce", so
          // it survives that many hits and only dies on the one after.
          const limit = bd?.wallBounces ?? 0
          if (limit > 0 && b.wallHits > limit) {
            this.pool.release(i)
            continue
          }
          // bounce/wrap put it back inside, so the next crossing counts again
          b.wasOutside = false
        } else {
          b.wasOutside = outside
        }
      }

      // a loose laser stays visible until its tail has also left the stage
      const margin = b.kind === 2 ? b.laserLength : 0

      if (
        b.age >= b.life ||
        b.alpha <= 0 ||
        b.x < -halfW - margin ||
        b.x > halfW + margin ||
        b.y < -halfH - margin ||
        b.y > halfH + margin
      ) {
        this.pool.release(i)
      }
    }
  }

  private applyModifiers(b: SimBullet, index: number, mods: Modifier[]) {
    for (let m = 0; m < mods.length && m < 30; m++) {
      const mod = mods[m]
      if (!mod.enabled) continue
      const bit = 1 << m

      if ((mod.trigger ?? 'age') === 'wall') {
        // fires once, the frame after the `at`-th wall contact
        if (b.wallHits < Math.max(1, mod.at) || b.fired & bit) continue
        b.fired |= bit
        if (!this.applyModifierOnce(b, index, mod)) return
        continue
      }

      const age = b.age
      const within =
        age >= mod.at && (mod.duration <= 0 ? age === mod.at : age < mod.at + mod.duration)
      if (!within) continue
      const once = mod.duration <= 0

      switch (mod.type) {
        case 'rotate':
          b.angle += mod.amount
          break
        case 'accel': {
          // ease from whatever the bullet is doing now to the target speed
          const target = mod.targetSpeed ?? mod.amount
          const span = Math.max(1, mod.duration)
          if (!(b.fired & bit)) {
            b.fired |= bit
            b.rampFrom = b.speed
            b.rampAt = age
          }
          const t = (age - mod.at + 1) / span
          b.speed = b.rampFrom + (target - b.rampFrom) * applyEase(t, mod.ease ?? 'linear')
          break
        }
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
          // depth is already guaranteed to be 0 here — modifiers never run for
          // children — so a child can never split again.
          if (!(b.fired & bit)) {
            b.fired |= bit
            this.applySplit(b, mod)
          }
          break
        case 'graphic':
          if (!(b.fired & bit)) {
            b.fired |= bit
            const next = this.resolveShotId(mod.text ?? '')
            if (next > 0) b.shotId = next
          }
          break
        case 'reaim':
          if (!(b.fired & bit)) {
            b.fired |= bit
            const player = this.playerPosition()
            b.angle = Math.atan2(player.y - b.y, player.x - b.x) * R2D
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

  /**
   * Wall contact is a point in time, not a span, so duration-based kinds
   * (accel / fade / scale / gravity / rotate) apply their end state in one
   * shot here instead of interpolating — there is no later frame to ease
   * towards once the modifier has already fired.
   */
  private applyModifierOnce(b: SimBullet, index: number, mod: Modifier): boolean {
    switch (mod.type) {
      case 'rotate':
        b.angle += mod.amount
        break
      case 'accel':
        b.rampFrom = b.speed
        b.rampAt = -1
        b.speed = mod.targetSpeed ?? mod.amount
        break
      case 'gravity':
        b.gvx += mod.amount2
        b.gvy += mod.amount
        break
      case 'fade':
        b.alpha = mod.amount
        break
      case 'scale':
        b.scale = mod.amount * b.baseScale
        break
      case 'random':
        b.angle += this.rng.jitter(mod.amount2)
        b.speed += this.rng.jitter(mod.amount)
        break
      case 'split':
        this.applySplit(b, mod)
        break
      case 'graphic': {
        const next = this.resolveShotId(mod.text ?? '')
        if (next > 0) b.shotId = next
        break
      }
      case 'reaim': {
        const player = this.playerPosition()
        b.angle = Math.atan2(player.y - b.y, player.x - b.x) * R2D
        break
      }
      case 'destroy':
        this.pool.release(index)
        return false
      case 'wait':
        break
    }
    return true
  }

  /**
   * Fire a small nested pattern from wherever `b` currently is.
   *
   * A split is really just "fire a tiny pattern from the parent bullet's
   * position", so instead of hand-rolling the fan math this synthesises a
   * throwaway Pattern for the child and hands it to the same `resolveShot()`
   * every top-level shot goes through. That's what makes circle / oval / rose
   * / laser splits work with zero extra shape code — they're the exact same
   * code path as a real pattern, just fired once from a moving origin.
   */
  private applySplit(b: SimBullet, mod: Modifier) {
    const parentPattern = this.compiled.patterns[b.patternIdx]?.pattern
    if (!parentPattern) return
    const cfg = splitChildOf(mod)
    const childPattern: Pattern = {
      ...parentPattern,
      type: cfg.type,
      count: Math.max(1, Math.round(cfg.count)),
      angleBase: b.angle + cfg.angleOffset,
      angleSpread: cfg.angleSpread,
      radius: cfg.radius,
      // one-shot fire — anything that only makes sense across several shots
      // of the same pattern (spin, wave, aim, mirroring, jitter) is off
      angleStep: 0,
      wave: 0,
      aimPlayer: false,
      mirrorMode: 'none',
      angleRandom: 0,
      laserType: cfg.laserType,
      laserLength: cfg.laserLength,
      laserWidth: cfg.laserWidth,
      laserDelay: cfg.laserDelay,
      bullet: {
        ...parentPattern.bullet,
        speed: cfg.inheritSpeed ? b.speed : cfg.speed,
        speedRand: cfg.speedRand,
        scale: cfg.scale,
        life: cfg.life,
        delay: 0,
        shotDataId: cfg.shotDataId || parentPattern.bullet.shotDataId,
        // child doesn't resume the parent's in-progress ramp — restarting it
        // mid-flight from an arbitrary speed reads as broken, not intentional
        rampDuration: 0,
      },
    }
    // aimAngle is unused because aimPlayer is forced off above
    for (const s of resolveShot(childPattern, 0, 0, 0, this.rng)) {
      // patternIdx stays the PARENT's: it's only consulted for modifier
      // resolution, and children (depth 1) never receive modifiers, so this
      // has no effect beyond keeping the renderer's bucketing untouched.
      this.emit(childPattern, b.patternIdx, b.x + s.dx, b.y + s.dy, s.angle, s.speed, 1)
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
