/**
 * Intermediate AST between .dmk and the Danmakufu ph3 text output.
 *
 * The GUI never emits script directly: .dmk → AST → generator. Keeping the AST
 * in the middle means a second backend (or a different ph3 dialect) only has to
 * replace the generator.
 */

import type { BlendMode, LaserType, Modifier, PatternType } from '../types/dmk'

export interface BulletNode {
  shotDataId: string
  speed: number
  speedRand: number
  accel: number
  maxSpeed: number
  angularVelocity: number
  life: number
  scale: number
  blend: BlendMode
  delay: number
}

export interface SpawnNode {
  kind: 'spawn'
  patternType: PatternType
  count: number
  layers: number
  layerSpeedStep: number
  radius: number
  angleBase: number
  angleSpread: number
  angleStep: number
  spinDirection: 1 | -1
  wave: number
  wavePeriod: number
  angleRandom: number
  aimPlayer: boolean
  ovalRatio: number
  shapeTilt: number
  polygonSides: number
  rosePetals: number
  lineSpacing: number
  speedStep: number
  bullet: BulletNode
  laserType: LaserType
  laserLength: number
  laserWidth: number
  laserDelay: number
  /** name of the generated per-bullet control task, or null when not needed */
  controlTask: string | null
}

/** One pattern clip → one ph3 task. */
export interface PatternTaskNode {
  taskName: string
  emitterName: string
  patternName: string
  startFrame: number
  endFrame: number
  offset: number
  interval: number
  loop: boolean
  loopInterval: number
  originX: number
  originY: number
  rotation: number
  /** shots originate from objBoss instead of a fixed point */
  followsBoss: boolean
  spawn: SpawnNode
}

export interface MoveSegment {
  atFrame: number
  frames: number
  x: number
  y: number
}

export interface MoveTaskNode {
  taskName: string
  emitterName: string
  segments: MoveSegment[]
}

export interface ControlTaskNode {
  taskName: string
  modifiers: Modifier[]
}

export interface SoundNode {
  name: string
  fileName: string
  frame: number
  volume: number
  loop: boolean
}

export interface TimelineAst {
  title: string
  duration: number
  stageWidth: number
  stageHeight: number
  bossName: string
  bossLife: number
  bossX: number
  bossY: number
  shotConstInclude: string
  patternTasks: PatternTaskNode[]
  moveTasks: MoveTaskNode[]
  controlTasks: ControlTaskNode[]
  sounds: SoundNode[]
  shotDataIds: string[]
}
