import type {
  BulletDef,
  BulletShape,
  EmitterDef,
  Modifier,
  ModifierType,
  Pattern,
  PatternType,
  SoundDef,
} from './dmk'
import { suggestShotDataId } from './shapes'

let counter = 0
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Clip / tree colours, cycled as new patterns are created. */
export const CLIP_COLORS = [
  '#8b5cf6',
  '#f87171',
  '#fb923c',
  '#2dd4bf',
  '#84cc16',
  '#f472b6',
  '#38bdf8',
  '#facc15',
]

/** `name` is the ph3 colour prefix used to build a ShotDataID (RED + 01). */
export const BULLET_PRESETS: { label: string; name: string; color: string }[] = [
  { label: '赤', name: 'RED', color: '#f43f5e' },
  { label: '橙', name: 'ORANGE', color: '#fb923c' },
  { label: '黄', name: 'YELLOW', color: '#facc15' },
  { label: '緑', name: 'GREEN', color: '#4ade80' },
  { label: '水', name: 'SKY', color: '#38bdf8' },
  { label: '青', name: 'BLUE', color: '#6366f1' },
  { label: '紫', name: 'PURPLE', color: '#a855f7' },
  { label: '白', name: 'WHITE', color: '#e2e8f0' },
]

export const PATTERN_LABELS: Record<PatternType, string> = {
  circle: 'Circle',
  spiral: 'Spiral',
  fan: 'Fan',
  wave: 'Wave',
  cross: 'Cross',
  flower: 'Flower',
  nway: 'N-Way',
  random: 'Random',
  ring: 'Ring',
  burst: 'Burst',
  laser: 'Laser',
  aim: 'Aim',
  oval: 'Oval',
  polygon: 'Polygon',
  rose: 'Rose',
  line: 'Line',
  whip: 'Whip',
}

/** Order shown in the pattern library grid. */
export const PATTERN_LIBRARY: PatternType[] = [
  'circle',
  'spiral',
  'fan',
  'wave',
  'cross',
  'flower',
  'nway',
  'random',
  'ring',
  'burst',
  'laser',
  'aim',
  'oval',
  'polygon',
  'rose',
  'line',
  'whip',
]

export const PATTERN_CATEGORY: Record<PatternType, '基本' | '東方風' | 'CAVE風' | 'その他'> = {
  circle: '基本',
  ring: '基本',
  nway: '基本',
  fan: '基本',
  line: '基本',
  spiral: '東方風',
  flower: '東方風',
  wave: '東方風',
  cross: '東方風',
  oval: '東方風',
  rose: '東方風',
  burst: 'CAVE風',
  random: 'CAVE風',
  aim: 'CAVE風',
  whip: 'CAVE風',
  polygon: 'その他',
  laser: 'その他',
}

export function defaultBullet(): BulletDef {
  return {
    shotDataId: 'PURPLE01',
    graphic: 'PURPLE',
    shape: 'ball',
    color: '#a855f7',
    speed: 3,
    speedRand: 0,
    accel: 0,
    maxSpeed: 6,
    angularVelocity: 0,
    life: 300,
    scale: 1,
    blend: 'alpha',
    delay: 8,
    hitboxRadius: 4,
  }
}

export function defaultModifier(type: ModifierType): Modifier {
  const base: Modifier = {
    id: uid('mod'),
    type,
    enabled: true,
    at: 30,
    duration: 0,
    amount: 0,
    amount2: 0,
  }
  switch (type) {
    case 'rotate':
      return { ...base, duration: 60, amount: 1.5 }
    case 'gravity':
      return { ...base, duration: 120, amount: 0.05 }
    case 'accel':
      return { ...base, duration: 60, amount: 0.05 }
    case 'split':
      return { ...base, at: 60, amount: 5, amount2: 60 }
    case 'fade':
      return { ...base, at: 120, duration: 30, amount: 0 }
    case 'scale':
      return { ...base, duration: 30, amount: 1.8 }
    case 'random':
      return { ...base, at: 0, amount2: 15 }
    case 'destroy':
      return { ...base, at: 240 }
    case 'wait':
      return { ...base, at: 0, duration: 30 }
    case 'graphic':
      return { ...base, at: 60, text: '' }
    case 'reaim':
      return { ...base, at: 45 }
  }
}

export function defaultPattern(
  type: PatternType = 'circle',
  startFrame = 0,
  colorIndex = 0,
): Pattern {
  const p: Pattern = {
    id: uid('pat'),
    name: `${PATTERN_LABELS[type]} Shot`,
    type,
    enabled: true,
    color: CLIP_COLORS[colorIndex % CLIP_COLORS.length],

    startFrame,
    endFrame: startFrame + 300,
    loop: false,
    loopInterval: 0,
    priority: 0,

    interval: 20,
    offset: 0,
    count: 16,
    layers: 1,
    layerSpeedStep: 0.4,
    radius: 0,
    angleBase: 90,
    angleSpread: 60,
    angleStep: 7,
    spinDirection: 1,
    wave: 0,
    wavePeriod: 60,
    angleRandom: 0,
    aimPlayer: false,

    ovalRatio: 1.8,
    shapeTilt: 30,
    polygonSides: 5,
    rosePetals: 4,
    lineSpacing: 18,
    speedStep: 0.35,

    bullet: defaultBullet(),
    modifiers: [],

    laserType: 'straight',
    laserLength: 320,
    laserWidth: 16,
    laserDelay: 60,
  }

  switch (type) {
    case 'ring':
      return { ...p, count: 24, radius: 60, interval: 30 }
    case 'spiral':
      return { ...p, count: 4, interval: 6, angleStep: 15, radius: 20 }
    case 'nway':
      return { ...p, count: 5, angleSpread: 40, interval: 24 }
    case 'fan':
      return { ...p, count: 9, angleSpread: 90, interval: 30 }
    case 'laser':
      return {
        ...p,
        count: 4,
        interval: 120,
        angleSpread: 120,
        laserType: 'straight',
        laserDelay: 60,
        // lasers have their own telegraph, so no separate spawn delay
        bullet: { ...p.bullet, life: 90, delay: 0 },
      }
    case 'random':
      return { ...p, count: 8, interval: 6, angleSpread: 360, angleRandom: 180 }
    case 'aim':
      return { ...p, count: 3, angleSpread: 20, aimPlayer: true, interval: 20 }
    case 'wave':
      return { ...p, count: 6, interval: 4, angleSpread: 30, wave: 45, wavePeriod: 80 }
    case 'flower':
      return { ...p, count: 12, interval: 4, angleStep: 11, layers: 2 }
    case 'cross':
      return { ...p, count: 4, interval: 12, angleStep: 3 }
    case 'burst':
      return { ...p, count: 40, interval: 120, angleSpread: 360, layers: 3, layerSpeedStep: 0.6 }
    case 'oval':
      return { ...p, count: 28, interval: 40, ovalRatio: 1.9, shapeTilt: 30, angleStep: 6 }
    case 'polygon':
      return { ...p, count: 30, interval: 45, polygonSides: 5, shapeTilt: 0, angleStep: 5 }
    case 'rose':
      return { ...p, count: 36, interval: 50, rosePetals: 4, shapeTilt: 0, angleStep: 9 }
    case 'line':
      return {
        ...p,
        count: 9,
        interval: 35,
        lineSpacing: 26,
        angleBase: 90,
        angleStep: 0,
        bullet: { ...p.bullet, speed: 2.4 },
      }
    case 'whip':
      return {
        ...p,
        count: 10,
        interval: 20,
        speedStep: 0.32,
        angleStep: 13,
        bullet: { ...p.bullet, speed: 1.4 },
      }
    default:
      return p
  }
}

/** Apply a colour preset + silhouette to a pattern, keeping ShotDataID in sync. */
export function styleBullet(p: Pattern, colorName: string, shape: BulletShape): Pattern {
  const preset = BULLET_PRESETS.find((b) => b.name === colorName)
  p.bullet.graphic = colorName
  p.bullet.shape = shape
  if (preset) p.bullet.color = preset.color
  p.bullet.shotDataId = suggestShotDataId(colorName, shape)
  return p
}

export function defaultEmitter(name: string, x = 0, y = -120): EmitterDef {
  return {
    id: uid('emt'),
    name,
    x,
    y,
    rotation: 0,
    visible: true,
    collapsed: false,
    keys: { x: [], y: [], rotation: [] },
    patterns: [],
  }
}

export function defaultSound(name: string, startFrame = 0): SoundDef {
  return {
    id: uid('snd'),
    name,
    src: null,
    fileName: '',
    volume: 0.8,
    pan: 0,
    loop: false,
    fadeIn: 0,
    fadeOut: 0,
    startFrame,
    endFrame: startFrame + 300,
  }
}
