import {
  DEFAULT_SHOT_CONST_INCLUDE,
  sortKeys,
  type Modifier,
  type Pattern,
  type Project,
} from '../types/dmk'
import { splitChildOf } from '../types/factory'
import type {
  ControlTaskNode,
  LoweredModifier,
  MoveSegment,
  MoveTaskNode,
  PatternTaskNode,
  SoundNode,
  SpawnNode,
  TimelineAst,
  WallTaskNode,
} from './ast'

function ident(s: string, fallback: string): string {
  const cleaned = s.replace(/[^0-9A-Za-z_]/g, '')
  const safe = cleaned.length > 0 ? cleaned : fallback
  return /^[0-9]/.test(safe) ? `_${safe}` : safe
}

function lowerSpawn(p: Pattern, controlTask: string | null, wallTask: string | null): SpawnNode {
  return {
    kind: 'spawn',
    patternType: p.type,
    count: Math.max(1, Math.round(p.count)),
    layers: Math.max(1, Math.round(p.layers)),
    layerSpeedStep: p.layerSpeedStep,
    radius: p.radius,
    angleBase: p.angleBase,
    angleSpread: p.angleSpread,
    angleStep: p.angleStep,
    spinDirection: p.spinDirection,
    wave: p.wave,
    wavePeriod: p.wavePeriod,
    angleRandom: p.angleRandom,
    aimPlayer: p.aimPlayer,
    ovalRatio: p.ovalRatio,
    shapeTilt: p.shapeTilt,
    polygonSides: Math.max(3, Math.round(p.polygonSides)),
    rosePetals: Math.max(1, Math.round(p.rosePetals)),
    lineSpacing: p.lineSpacing,
    speedStep: p.speedStep,
    mirrorMode: p.mirrorMode ?? 'none',
    bullet: {
      shotDataId: p.bullet.shotDataId,
      speed: p.bullet.speed,
      speedRand: p.bullet.speedRand,
      accel: p.bullet.accel,
      maxSpeed: p.bullet.maxSpeed,
      rampTarget: p.bullet.rampTarget,
      rampDuration: Math.max(0, Math.round(p.bullet.rampDuration)),
      rampDelay: Math.max(0, Math.round(p.bullet.rampDelay)),
      rampEase: p.bullet.rampEase ?? 'linear',
      angularVelocity: p.bullet.angularVelocity,
      life: p.bullet.life,
      scale: p.bullet.scale,
      blend: p.bullet.blend,
      delay: p.bullet.delay,
    },
    laserType: p.laserType,
    laserLength: p.laserLength,
    laserWidth: p.laserWidth,
    laserDelay: Math.max(0, Math.round(p.laserDelay)),
    wallBehavior: p.bullet.wallBehavior ?? 'none',
    wallBounces: Math.max(0, Math.round(p.bullet.wallBounces ?? 0)),
    controlTask,
    wallTask,
  }
}

/**
 * A split fires a small nested pattern, so — same as the engine — it gets a
 * SpawnNode of its own rather than bespoke ph3 for "just a fan". Built once
 * here so danmakufu.ts only has to hand it to `writeSpawnBody`.
 */
function lowerSplitSpawn(p: Pattern, m: Modifier): SpawnNode {
  const c = splitChildOf(m)
  return {
    kind: 'spawn',
    patternType: c.type,
    count: Math.max(1, Math.round(c.count)),
    layers: 1,
    layerSpeedStep: 0,
    radius: c.radius,
    // unused by writeSpawnBody for split calls — the caller injects the full
    // angle expression (ObjMove_GetAngle(obj) + offset) directly
    angleBase: 0,
    angleSpread: c.angleSpread,
    angleStep: 0,
    spinDirection: 1,
    wave: 0,
    wavePeriod: 0,
    angleRandom: 0,
    aimPlayer: false,
    // shape-specific knobs aren't part of SplitChild — the child borrows the
    // parent's so oval/polygon/rose splits keep the parent's proportions
    ovalRatio: p.ovalRatio,
    shapeTilt: p.shapeTilt,
    polygonSides: Math.max(3, Math.round(p.polygonSides)),
    rosePetals: Math.max(1, Math.round(p.rosePetals)),
    lineSpacing: p.lineSpacing,
    speedStep: p.speedStep,
    mirrorMode: 'none',
    bullet: {
      shotDataId: c.shotDataId.trim() || p.bullet.shotDataId,
      speed: c.speed,
      speedRand: c.speedRand,
      accel: p.bullet.accel,
      maxSpeed: p.bullet.maxSpeed,
      rampTarget: p.bullet.rampTarget,
      rampDuration: 0,
      rampDelay: 0,
      rampEase: 'linear',
      angularVelocity: p.bullet.angularVelocity,
      life: c.life,
      scale: c.scale,
      blend: p.bullet.blend,
      delay: 0,
    },
    laserType: c.laserType,
    laserLength: c.laserLength,
    laserWidth: c.laserWidth,
    laserDelay: Math.max(0, Math.round(c.laserDelay)),
    wallBehavior: 'none',
    wallBounces: 0,
    // a child never carries behaviour of its own — matches the engine, where
    // split children get no modifiers and never re-split
    controlTask: null,
    wallTask: null,
  }
}

function lowerModifier(p: Pattern, m: Modifier): LoweredModifier {
  if (m.type !== 'split') return m
  return { ...m, childSpawn: lowerSplitSpawn(p, m) }
}

/** .dmk → AST. Pure; no ph3 syntax knowledge lives here. */
export function lower(project: Project): TimelineAst {
  const patternTasks: PatternTaskNode[] = []
  const moveTasks: MoveTaskNode[] = []
  const controlTasks: ControlTaskNode[] = []
  const wallTasks: WallTaskNode[] = []
  const sounds: SoundNode[] = []
  const shotDataIds = new Set<string>()
  const usedNames = new Set<string>()

  const uniqueName = (base: string) => {
    let name = base
    let n = 2
    while (usedNames.has(name)) name = `${base}${n++}`
    usedNames.add(name)
    return name
  }

  let boss = { x: 0, y: -120 }
  let bossSet = false

  for (const emitter of project.emitters) {
    if (!emitter.visible) continue

    const kx = sortKeys(emitter.keys.x)
    const ky = sortKeys(emitter.keys.y)
    const animated = kx.length > 1 || ky.length > 1

    if (animated && !bossSet) {
      bossSet = true
      boss = { x: kx[0]?.value ?? emitter.x, y: ky[0]?.value ?? emitter.y }
    }

    for (const p of emitter.patterns) {
      if (!p.enabled) continue
      shotDataIds.add(p.bullet.shotDataId)

      // The pattern's own speed ramp is just an `accel` modifier that the user
      // did not have to add by hand, so it rides the same control task. It is
      // always age-triggered — there is no UI to make the ramp itself wall-fired.
      const ageMods: LoweredModifier[] = p.modifiers
        .filter((m) => m.enabled && (m.trigger ?? 'age') !== 'wall')
        .map((m) => lowerModifier(p, m))
      if (p.bullet.rampDuration > 0) {
        ageMods.unshift({
          id: `${p.id}_ramp`,
          type: 'accel',
          enabled: true,
          at: Math.max(0, Math.round(p.bullet.rampDelay)),
          duration: Math.max(1, Math.round(p.bullet.rampDuration)),
          amount: p.bullet.rampTarget,
          amount2: 0,
          targetSpeed: p.bullet.rampTarget,
          ease: p.bullet.rampEase ?? 'linear',
        })
      }
      let controlTask: string | null = null
      if (ageMods.length > 0) {
        controlTask = uniqueName(`TCtrl${ident(p.name, 'Pattern')}`)
        controlTasks.push({ taskName: controlTask, modifiers: ageMods })
      }

      // A straight (anchored) laser never moves, so wall contact can't happen —
      // matches the engine, which skips kind-1 bullets the same way.
      const anchoredLaser = p.type === 'laser' && p.laserType === 'straight'
      const wallBehavior = p.bullet.wallBehavior ?? 'none'
      const wallMods = p.modifiers
        .filter((m) => m.enabled && (m.trigger ?? 'age') === 'wall')
        .sort((a, b) => a.at - b.at)
        .map((m) => lowerModifier(p, m))
      // Detection and response are independent: a bullet can fly straight
      // through the wall and still trigger a modifier on the way out, so the
      // watcher is needed whenever *either* is asked for. This mirrors the
      // engine, which counts crossings regardless of wallBehavior.
      let wallTask: string | null = null
      if ((wallBehavior !== 'none' || wallMods.length > 0) && !anchoredLaser) {
        wallTask = uniqueName(`TWall${ident(p.name, 'Pattern')}`)
        wallTasks.push({
          taskName: wallTask,
          behavior: wallBehavior,
          bounces: Math.max(0, Math.round(p.bullet.wallBounces ?? 0)),
          modifiers: wallMods,
        })
      }

      patternTasks.push({
        taskName: uniqueName(`T${ident(emitter.name, 'Emitter')}_${ident(p.name, 'Pattern')}`),
        emitterName: emitter.name,
        patternName: p.name,
        startFrame: Math.max(0, Math.round(p.startFrame)),
        endFrame: Math.max(0, Math.round(p.endFrame)),
        offset: Math.max(0, Math.round(p.offset)),
        interval: Math.max(1, Math.round(p.interval)),
        loop: p.loop,
        loopInterval:
          p.loopInterval > 0 ? Math.round(p.loopInterval) : Math.round(p.endFrame - p.startFrame),
        originX: emitter.x,
        originY: emitter.y,
        rotation: emitter.rotation,
        followsBoss: animated,
        spawn: lowerSpawn(p, controlTask, wallTask),
      })
    }

    // Keyframed motion becomes a dedicated ObjMove_SetDestAtFrame task.
    if (animated) {
      const frames = Array.from(new Set([...kx, ...ky].map((k) => k.frame))).sort((a, b) => a - b)
      const segments: MoveSegment[] = []
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]
        const prev = i === 0 ? f : frames[i - 1]
        segments.push({
          atFrame: prev,
          frames: i === 0 ? 1 : f - prev,
          x: sampleAt(kx, f, emitter.x),
          y: sampleAt(ky, f, emitter.y),
        })
      }
      moveTasks.push({
        taskName: uniqueName(`TMove${ident(emitter.name, 'Emitter')}`),
        emitterName: emitter.name,
        segments,
      })
    }
  }

  if (!bossSet && project.emitters.length > 0) {
    boss = { x: project.emitters[0].x, y: project.emitters[0].y }
  }

  for (const s of project.sounds) {
    sounds.push({
      name: ident(s.name, 'Sound'),
      fileName: s.fileName || `${s.name}.wav`,
      frame: Math.max(0, Math.round(s.startFrame)),
      volume: s.volume,
      loop: s.loop,
    })
  }

  return {
    title: project.name,
    duration: project.settings.duration,
    stageWidth: project.settings.stageWidth,
    stageHeight: project.settings.stageHeight,
    bossName: project.settings.bossName,
    bossLife: project.settings.bossLife,
    bossX: boss.x,
    bossY: boss.y,
    shotConstInclude:
      project.settings.shotConstInclude?.trim() || DEFAULT_SHOT_CONST_INCLUDE,
    patternTasks,
    moveTasks,
    controlTasks,
    wallTasks,
    sounds,
    shotDataIds: [...shotDataIds],
  }
}

function sampleAt(keys: { frame: number; value: number }[], frame: number, fallback: number) {
  if (keys.length === 0) return fallback
  let best = keys[0]
  for (const k of keys) if (k.frame <= frame) best = k
  return best.value
}
