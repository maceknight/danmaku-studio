/**
 * .dmk — Danmaku Studio project format (v2).
 *
 * Single source of truth shared by the UI, the simulation engine and the ph3
 * compiler. Nothing here may import React or PixiJS.
 *
 * v2 model: a Pattern *is* the timeline clip. Emitters are the groups that own
 * them (and carry the keyframed motion); patterns carry their own start/end.
 */

export const FPS = 60

// ---------------------------------------------------------------------------
// Keyframes (continuous properties)
// ---------------------------------------------------------------------------

export type Easing = 'linear' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut'

export interface Keyframe {
  id: string
  frame: number
  value: number
  ease: Easing
}

export interface KeyframeChannels {
  x: Keyframe[]
  y: Keyframe[]
  rotation: Keyframe[]
}

// ---------------------------------------------------------------------------
// Bullets
// ---------------------------------------------------------------------------

export type BlendMode = 'alpha' | 'add' | 'multiply'

export interface BulletDef {
  shotDataId: string
  graphic: string
  color: string
  speed: number
  speedRand: number
  accel: number
  maxSpeed: number
  angularVelocity: number
  life: number
  scale: number
  blend: BlendMode
  delay: number
  hitboxRadius: number
}

// ---------------------------------------------------------------------------
// Modifiers — behaviour applied relative to a bullet's own age
// ---------------------------------------------------------------------------

export type ModifierType =
  | 'rotate'
  | 'gravity'
  | 'accel'
  | 'split'
  | 'fade'
  | 'scale'
  | 'random'
  | 'destroy'
  | 'wait'

export interface Modifier {
  id: string
  type: ModifierType
  enabled: boolean
  /** bullet age (frames) at which the modifier fires */
  at: number
  /** frames over which it applies; 0 = instantaneous */
  duration: number
  amount: number
  amount2: number
}

// ---------------------------------------------------------------------------
// Patterns — the timeline clips
// ---------------------------------------------------------------------------

export type PatternType =
  | 'circle'
  | 'ring'
  | 'spiral'
  | 'nway'
  | 'laser'
  | 'random'
  | 'aim'
  | 'wave'
  | 'flower'
  | 'cross'
  | 'burst'
  | 'fan'

export interface Pattern {
  id: string
  name: string
  type: PatternType
  enabled: boolean
  /** display colour of the clip / tree dot */
  color: string

  // --- timeline -------------------------------------------------------------
  startFrame: number
  endFrame: number
  loop: boolean
  /** frames per loop cycle; 0 = use the clip length */
  loopInterval: number
  priority: number

  // --- firing ---------------------------------------------------------------
  /** frames between shots */
  interval: number
  /** frames to wait after the clip starts before the first shot */
  offset: number
  count: number
  layers: number
  layerSpeedStep: number
  radius: number
  /** base direction in degrees (0 = right, 90 = down) */
  angleBase: number
  /** total fan width in degrees */
  angleSpread: number
  /** degrees added to angleBase after every shot */
  angleStep: number
  /** -1 = counter-clockwise spin */
  spinDirection: 1 | -1
  wave: number
  wavePeriod: number
  angleRandom: number
  aimPlayer: boolean

  bullet: BulletDef
  modifiers: Modifier[]

  laserLength: number
  laserWidth: number
}

// ---------------------------------------------------------------------------
// Emitters (tree groups) / sounds
// ---------------------------------------------------------------------------

export interface EmitterDef {
  id: string
  name: string
  x: number
  y: number
  rotation: number
  visible: boolean
  collapsed: boolean
  keys: KeyframeChannels
  patterns: Pattern[]
}

export interface SoundDef {
  id: string
  name: string
  /** session-only marker; audio buffers are never serialised */
  src: string | null
  fileName: string
  volume: number
  pan: number
  loop: boolean
  fadeIn: number
  fadeOut: number
  startFrame: number
  endFrame: number
}

export interface ProjectSettings {
  fps: number
  duration: number
  stageWidth: number
  stageHeight: number
  seed: number
  playerX: number
  playerY: number
  bossName: string
  bossLife: number
}

export interface Project {
  version: 2
  name: string
  settings: ProjectSettings
  /** ordered — drives the object tree and the timeline groups */
  emitters: EmitterDef[]
  sounds: SoundDef[]
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function findEmitter(p: Project, id: string): EmitterDef | undefined {
  return p.emitters.find((e) => e.id === id)
}

export function findPattern(
  p: Project,
  emitterId: string,
  patternId: string,
): Pattern | undefined {
  return findEmitter(p, emitterId)?.patterns.find((x) => x.id === patternId)
}

export function findSound(p: Project, id: string): SoundDef | undefined {
  return p.sounds.find((s) => s.id === id)
}

// ---------------------------------------------------------------------------
// Keyframe evaluation
// ---------------------------------------------------------------------------

function ease(t: number, kind: Easing): number {
  switch (kind) {
    case 'hold':
      return 0
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    default:
      return t
  }
}

/** Sample a keyframe channel at `frame`, falling back to `fallback` when empty. */
export function sampleChannel(keys: Keyframe[], frame: number, fallback: number): number {
  if (keys.length === 0) return fallback
  if (frame <= keys[0].frame) return keys[0].value
  const last = keys[keys.length - 1]
  if (frame >= last.frame) return last.value
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const span = b.frame - a.frame
      if (span <= 0) return b.value
      return a.value + (b.value - a.value) * ease((frame - a.frame) / span, a.ease)
    }
  }
  return fallback
}

export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.frame - b.frame)
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

export function frameToSeconds(frame: number): number {
  return frame / FPS
}

/** `00:05.20` */
export function formatTimecode(frame: number): string {
  const total = frame / FPS
  const m = Math.floor(total / 60)
  const s = total - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}
