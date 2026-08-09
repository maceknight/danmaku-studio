import { sortKeys, type Modifier, type Pattern, type Project } from '../types/dmk'
import type {
  ControlTaskNode,
  MoveSegment,
  MoveTaskNode,
  PatternTaskNode,
  SoundNode,
  SpawnNode,
  TimelineAst,
} from './ast'

function ident(s: string, fallback: string): string {
  const cleaned = s.replace(/[^0-9A-Za-z_]/g, '')
  const safe = cleaned.length > 0 ? cleaned : fallback
  return /^[0-9]/.test(safe) ? `_${safe}` : safe
}

function lowerSpawn(p: Pattern, controlTask: string | null): SpawnNode {
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
    bullet: {
      shotDataId: p.bullet.shotDataId,
      speed: p.bullet.speed,
      speedRand: p.bullet.speedRand,
      accel: p.bullet.accel,
      maxSpeed: p.bullet.maxSpeed,
      angularVelocity: p.bullet.angularVelocity,
      life: p.bullet.life,
      scale: p.bullet.scale,
      blend: p.bullet.blend,
      delay: p.bullet.delay,
    },
    laserLength: p.laserLength,
    laserWidth: p.laserWidth,
    controlTask,
  }
}

/** .dmk → AST. Pure; no ph3 syntax knowledge lives here. */
export function lower(project: Project): TimelineAst {
  const patternTasks: PatternTaskNode[] = []
  const moveTasks: MoveTaskNode[] = []
  const controlTasks: ControlTaskNode[] = []
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

      const active: Modifier[] = p.modifiers.filter((m) => m.enabled)
      let controlTask: string | null = null
      if (active.length > 0) {
        controlTask = uniqueName(`TCtrl${ident(p.name, 'Pattern')}`)
        controlTasks.push({ taskName: controlTask, modifiers: active })
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
        spawn: lowerSpawn(p, controlTask),
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
    patternTasks,
    moveTasks,
    controlTasks,
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
