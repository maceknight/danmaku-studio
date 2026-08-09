import type {
  BulletDef,
  BulletShape,
  EmitterDef,
  Keyframe,
  Modifier,
  ModifierType,
  Pattern,
  PatternType,
  Project,
} from '../types/dmk'
import {
  defaultEmitter,
  defaultModifier,
  defaultPattern,
  defaultSound,
  styleBullet,
  uid,
} from '../types/factory'

export interface Sample {
  id: string
  name: string
  description: string
  tags: string[]
  build: () => Project
}

// --- small builders --------------------------------------------------------

const FPS = 60

function project(name: string, emitters: EmitterDef[], durationSec = 10): Project {
  const bgm = defaultSound('BGM', 0)
  bgm.loop = true
  bgm.endFrame = durationSec * FPS
  return {
    version: 2,
    name,
    settings: {
      fps: 60,
      duration: durationSec * FPS,
      stageWidth: 384,
      stageHeight: 448,
      seed: 20260809,
      playerX: 0,
      playerY: 170,
      bossName: 'Boss',
      bossLife: 2000,
    },
    emitters,
    sounds: [bgm],
  }
}

interface PatOpts {
  name?: string
  /** seconds */
  from?: number
  to?: number
  color?: string
  shape?: BulletShape
  colorIndex?: number
  set?: Partial<Omit<Pattern, 'bullet'>> & { bullet?: Partial<BulletDef> }
  mods?: { type: ModifierType; patch?: Partial<Modifier> }[]
}

function pat(type: PatternType, o: PatOpts = {}): Pattern {
  const p = defaultPattern(type, Math.round((o.from ?? 0) * FPS), o.colorIndex ?? 0)
  p.endFrame = Math.round((o.to ?? 10) * FPS)
  if (o.name) p.name = o.name
  styleBullet(p, o.color ?? 'PURPLE', o.shape ?? 'ball')
  if (o.set) {
    const { bullet, ...rest } = o.set
    Object.assign(p, rest)
    if (bullet) p.bullet = { ...p.bullet, ...bullet }
  }
  for (const m of o.mods ?? []) {
    p.modifiers.push({ ...defaultModifier(m.type), ...m.patch, id: uid('mod') })
  }
  return p
}

function keys(pairs: [number, number][], ease: Keyframe['ease'] = 'easeInOut'): Keyframe[] {
  return pairs.map(([sec, value]) => ({ id: uid('kf'), frame: Math.round(sec * FPS), value, ease }))
}

function emitter(name: string, x: number, y: number, patterns: Pattern[]): EmitterDef {
  const e = defaultEmitter(name, x, y)
  e.patterns = patterns
  return e
}

// --- samples ---------------------------------------------------------------

/** 1. The default project — a full spell with several layered patterns. */
function buildOpeningSpell(): Project {
  const boss = emitter('Boss Main', 0, -140, [
    pat('spiral', {
      name: 'Spiral Shot',
      from: 0.5,
      to: 9.5,
      color: 'PURPLE',
      shape: 'ball',
      colorIndex: 0,
      set: { interval: 6, count: 4, angleStep: 15, radius: 20 },
    }),
    pat('ring', {
      name: 'Ring Shot',
      from: 1,
      to: 10,
      color: 'RED',
      shape: 'ring',
      colorIndex: 1,
      set: { interval: 45, count: 24, radius: 60 },
    }),
    pat('laser', {
      name: 'Laser',
      from: 2,
      to: 8.3,
      color: 'ORANGE',
      shape: 'ball',
      colorIndex: 2,
      set: { interval: 90, count: 4, angleSpread: 120 },
    }),
    pat('wave', {
      name: 'Wave Shot',
      from: 1.5,
      to: 8,
      color: 'SKY',
      shape: 'rice',
      colorIndex: 3,
      set: { interval: 4, count: 6, wave: 45, wavePeriod: 80 },
    }),
  ])
  boss.keys.x = keys([
    [0, -90],
    [5, 90],
    [10, -90],
  ])

  const subA = emitter('Sub Emitter A', -110, -60, [
    pat('random', {
      name: 'Random Shot',
      from: 4,
      to: 10,
      color: 'GREEN',
      shape: 'rice',
      colorIndex: 4,
      set: { interval: 6, count: 8, angleRandom: 180 },
    }),
  ])
  const subB = emitter('Sub Emitter B', 110, -60, [
    pat('flower', {
      name: 'Flower Shot',
      from: 7,
      to: 10,
      color: 'PURPLE',
      shape: 'scale',
      colorIndex: 5,
      set: { interval: 4, count: 12, angleStep: 11, layers: 2 },
    }),
  ])

  return project('紅魔館ステージ_パターン01', [boss, subA, subB])
}

/** 2. Absolute basics: one emitter, one all-round burst, nothing else. */
function buildBasicCircle(): Project {
  const boss = emitter('Boss', 0, -120, [
    pat('circle', {
      name: '全方位弾',
      from: 0.5,
      to: 8,
      color: 'RED',
      shape: 'ball',
      set: { interval: 40, count: 20, bullet: { speed: 2.2 } },
    }),
  ])
  return project('01_基本の全方位弾', [boss], 8)
}

/** 3. Spiral density study — three counter-rotating arms. */
function buildTripleSpiral(): Project {
  const boss = emitter('Boss', 0, -120, [
    pat('spiral', {
      name: 'Spiral CW',
      from: 0,
      to: 10,
      color: 'SKY',
      shape: 'ball',
      colorIndex: 0,
      set: { interval: 3, count: 3, angleStep: 9, spinDirection: 1 },
    }),
    pat('spiral', {
      name: 'Spiral CCW',
      from: 0,
      to: 10,
      color: 'PURPLE',
      shape: 'ball',
      colorIndex: 6,
      set: { interval: 3, count: 3, angleStep: 9, spinDirection: -1, angleBase: 210 },
    }),
    pat('circle', {
      name: 'Pulse',
      from: 2,
      to: 10,
      color: 'WHITE',
      shape: 'orb',
      colorIndex: 7,
      set: { interval: 120, count: 32, layers: 2, layerSpeedStep: 0.9 },
    }),
  ])
  return project('02_三重スパイラル', [boss])
}

/** 4. Aimed fire — teaches aimPlayer plus a tight N-way. */
function buildAimedNway(): Project {
  const boss = emitter('Boss', 0, -130, [
    pat('aim', {
      name: '自機狙い 5way',
      from: 0.5,
      to: 9,
      color: 'YELLOW',
      shape: 'rice',
      colorIndex: 2,
      set: { interval: 24, count: 5, angleSpread: 30, aimPlayer: true },
    }),
    pat('nway', {
      name: '固定 11way',
      from: 3,
      to: 9,
      color: 'BLUE',
      shape: 'scale',
      colorIndex: 5,
      set: { interval: 70, count: 11, angleSpread: 150 },
    }),
  ])
  boss.keys.x = keys([
    [0, 0],
    [2.5, -110],
    [5, 110],
    [7.5, 0],
  ])
  return project('03_自機狙いとNWay', [boss], 9)
}

/** 5. Modifier showcase — gravity, split and fade on the same field. */
function buildModifierShowcase(): Project {
  const boss = emitter('Boss', 0, -150, [
    pat('nway', {
      name: '重力弾',
      from: 0.5,
      to: 9,
      color: 'SKY',
      shape: 'ball',
      colorIndex: 3,
      set: {
        interval: 30,
        count: 7,
        angleSpread: 120,
        angleBase: 90,
        bullet: { speed: 3.4 },
      },
      mods: [{ type: 'gravity', patch: { at: 0, duration: 240, amount: 0.06 } }],
    }),
    pat('circle', {
      name: '分裂弾',
      from: 2,
      to: 9,
      color: 'RED',
      shape: 'ballLarge',
      colorIndex: 1,
      set: { interval: 90, count: 6, bullet: { speed: 1.8, life: 240 } },
      mods: [
        { type: 'split', patch: { at: 45, amount: 7, amount2: 90 } },
        { type: 'destroy', patch: { at: 46 } },
      ],
    }),
    pat('random', {
      name: '消える霧',
      from: 1,
      to: 9,
      color: 'WHITE',
      shape: 'orb',
      colorIndex: 7,
      set: { interval: 5, count: 3, angleRandom: 180, bullet: { speed: 1.1 } },
      mods: [{ type: 'fade', patch: { at: 60, duration: 60, amount: 0 } }],
    }),
  ])
  return project('04_モディファイア見本', [boss], 9)
}

/** 6. Every silhouette side by side, for picking a shot graphic. */
function buildShapeCatalogue(): Project {
  const shapes: [BulletShape, string, string][] = [
    ['ball', 'RED', '小弾'],
    ['ring', 'ORANGE', '中弾'],
    ['ballLarge', 'YELLOW', '大弾'],
    ['orb', 'GREEN', '光玉'],
    ['scale', 'SKY', '鱗弾'],
    ['rice', 'BLUE', '米弾'],
    ['ofuda', 'PURPLE', '札'],
    ['ellipse', 'RED', '楕円弾'],
    ['star', 'YELLOW', '星弾'],
    ['butterfly', 'PURPLE', '蝶弾'],
    ['knife', 'SKY', 'ナイフ'],
  ]
  const emitters = shapes.map(([shape, color, label], i) => {
    const cols = 4
    const x = -130 + (i % cols) * 87
    const y = -170 + Math.floor(i / cols) * 95
    return emitter(label, x, y, [
      pat('circle', {
        name: label,
        from: 0,
        to: 10,
        color,
        shape,
        colorIndex: i,
        set: {
          interval: 90,
          count: 8,
          bullet: { speed: 0.85, life: 120, delay: 4 },
        },
      }),
    ])
  })
  return project('05_弾の種類カタログ', emitters)
}

/** 7. Laser-led piece — sweeping straight lasers with fill shots between. */
function buildLaserSweep(): Project {
  const boss = emitter('Boss', 0, -160, [
    pat('laser', {
      name: 'Sweep Laser',
      from: 0.5,
      to: 9.5,
      color: 'RED',
      shape: 'ball',
      colorIndex: 1,
      set: {
        interval: 75,
        count: 6,
        angleSpread: 200,
        angleStep: 17,
        laserLength: 460,
        laserWidth: 14,
      },
    }),
    pat('cross', {
      name: 'Cross Fill',
      from: 1.5,
      to: 9.5,
      color: 'BLUE',
      shape: 'ofuda',
      colorIndex: 5,
      set: { interval: 14, count: 4, angleStep: 4 },
    }),
  ])
  boss.keys.rotation = keys([
    [0, 0],
    [10, 360],
  ], 'linear')
  return project('06_レーザースイープ', [boss])
}

export const SAMPLES: Sample[] = [
  {
    id: 'opening-spell',
    name: '紅魔館ステージ_パターン01',
    description: '3つのエミッターに6パターンを重ねた、ひととおり入った見本。',
    tags: ['Spiral', 'Ring', 'Laser', 'Wave', 'キーフレーム'],
    build: buildOpeningSpell,
  },
  {
    id: 'basic-circle',
    name: '01_基本の全方位弾',
    description: 'エミッター1つ・パターン1つだけ。まずここから触るのがおすすめ。',
    tags: ['Circle', '入門'],
    build: buildBasicCircle,
  },
  {
    id: 'triple-spiral',
    name: '02_三重スパイラル',
    description: '左右に回るスパイラル2本と、定期的に広がるパルス。回転方向の違いが見える。',
    tags: ['Spiral', '回転方向', 'レイヤー'],
    build: buildTripleSpiral,
  },
  {
    id: 'aimed-nway',
    name: '03_自機狙いとNWay',
    description: '自機狙い5wayと固定11wayの対比。ボスは左右に移動する。',
    tags: ['Aim', 'NWay', 'キーフレーム'],
    build: buildAimedNway,
  },
  {
    id: 'modifiers',
    name: '04_モディファイア見本',
    description: '重力・分裂・フェードを1画面で比較。モディファイアの効き方を見る用。',
    tags: ['重力', '分裂', 'フェード'],
    build: buildModifierShowcase,
  },
  {
    id: 'shape-catalogue',
    name: '05_弾の種類カタログ',
    description: '11種類の弾の形をならべたもの。ShotDataID の当たりをつけるのに使える。',
    tags: ['弾の形', 'カタログ'],
    build: buildShapeCatalogue,
  },
  {
    id: 'laser-sweep',
    name: '06_レーザースイープ',
    description: '回転するボスから伸びるレーザーと、隙間を埋める札弾。',
    tags: ['Laser', 'Cross', '回転'],
    build: buildLaserSweep,
  },
]

/** The project a fresh editor session starts from. */
export function createProject(): Project {
  return SAMPLES[0].build()
}
