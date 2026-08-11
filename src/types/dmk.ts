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

/**
 * Bullet silhouettes modelled on 弾幕風 ph3's stock shot graphics.
 * Purely a preview concept — what ph3 actually draws is decided by
 * `shotDataId`, which stays hand-editable.
 */
export type BulletShape =
  | 'ball' // 小弾
  | 'ballLarge' // 大弾
  | 'ring' // 中弾
  | 'orb' // 光玉
  | 'scale' // 鱗弾
  | 'rice' // 米弾
  | 'ofuda' // 札
  | 'ellipse' // 楕円弾
  | 'star' // 星弾
  | 'butterfly' // 蝶弾
  | 'knife' // ナイフ弾

export interface BulletDef {
  shotDataId: string
  graphic: string
  shape: BulletShape
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
  /** swap the shot graphic mid-flight (ph3: ObjShot_SetGraphic) */
  | 'graphic'
  /** re-aim at the player mid-flight (ph3: ObjMove_SetAngle) */
  | 'reaim'

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
  /** ShotDataID for `graphic`; unused by the other kinds */
  text?: string
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
  /** 楕円 — ring squashed along one axis, tiltable */
  | 'oval'
  /** 多角形 — ring that traces a regular polygon */
  | 'polygon'
  /** 花弁 — rose curve, speed lobed by petal count */
  | 'rose'
  /** ライン — a straight wall of bullets, all travelling the same way */
  | 'line'
  /** 鞭 — one direction, speed ramped across the shot */
  | 'whip'

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

  // --- shape-specific ------------------------------------------------------
  /** oval: long axis ÷ short axis. 1 = a plain circle */
  ovalRatio: number
  /** oval / polygon / rose: rotation of the shape itself, in degrees */
  shapeTilt: number
  /** polygon: number of sides */
  polygonSides: number
  /** rose: petal count */
  rosePetals: number
  /** line: gap between neighbouring bullets */
  lineSpacing: number
  /** whip: speed added per bullet across the shot */
  speedStep: number

  bullet: BulletDef
  modifiers: Modifier[]

  /** 固定式（予告線→実体化） or 射出式（まち針） */
  laserType: LaserType
  laserLength: number
  laserWidth: number
  /** 固定式: 予告線が出てから実体化するまでのフレーム数 */
  laserDelay: number
}

/**
 * 固定式レーザー — 予告線が先に出て、遅れて実体化する。ph3 の
 * CreateStraightLaserA1 にあたる。
 * 射出式レーザー — 発射元から一定の長さまで伸びながら飛ぶ「まち針」。
 * ph3 の CreateLooseLaserA1 にあたる。
 */
export type LaserType = 'straight' | 'loose'

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
  /**
   * Path emitted as `#include` in the exported script. ShotDataID names only
   * mean something to ph3 if the file that defines them is included, so this
   * has to travel with the project.
   */
  shotConstInclude: string
}

export const DEFAULT_SHOT_CONST_INCLUDE = 'script/default_system/Default_ShotConst.txt'

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
