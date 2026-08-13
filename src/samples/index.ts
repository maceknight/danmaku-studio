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
  defaultSplitChild,
  styleBullet,
  uid,
} from '../types/factory'

export interface Sample {
  id: string
  /** lesson order; undefined = reference material rather than a lesson */
  lesson?: number
  name: string
  description: string
  /** what to look at and what to try changing */
  tip: string
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
      // the samples use the bundled bullet00 constant names
      shotConstInclude: './lib/bullet/lib_bullet.dnh',
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

// ---------------------------------------------------------------------------
// 講座 — 一つずつ要素を足していく
// ---------------------------------------------------------------------------

/** 00 — the two knobs that matter most: how many, how often. */
function lesson00(): Project {
  return project(
    '00_はじめの一発',
    [
      emitter('Boss', 0, -130, [
        pat('circle', {
          name: '全方位弾',
          from: 0.5,
          to: 8,
          color: 'RED',
          shape: 'ball',
          set: { interval: 60, count: 12, bullet: { speed: 2.2 } },
        }),
      ]),
    ],
    8,
  )
}

/** 01 — layers turn one ring into a wavefront. */
function lesson01(): Project {
  return project(
    '01_弾を層にする',
    [
      emitter('Boss', 0, -130, [
        pat('circle', {
          name: '3層リング',
          from: 0.5,
          to: 9,
          color: 'SKY',
          shape: 'ball',
          set: {
            interval: 90,
            count: 16,
            layers: 3,
            layerSpeedStep: 0.7,
            bullet: { speed: 1.6 },
          },
        }),
        pat('ring', {
          name: '半径つきリング',
          from: 3,
          to: 9,
          color: 'PURPLE',
          shape: 'ring',
          colorIndex: 6,
          set: { interval: 90, count: 20, radius: 70, bullet: { speed: 1.2 } },
        }),
      ]),
    ],
    9,
  )
}

/** 02 — angle step per shot is what makes an arm. */
function lesson02(): Project {
  return project('02_スパイラルの作り方', [
    emitter('Boss', 0, -120, [
      pat('spiral', {
        name: '右回り 2本腕',
        from: 0,
        to: 10,
        color: 'SKY',
        shape: 'ball',
        set: { interval: 4, count: 2, angleStep: 13, spinDirection: 1, bullet: { speed: 2.4 } },
      }),
      pat('spiral', {
        name: '左回り 2本腕',
        from: 0,
        to: 10,
        color: 'PURPLE',
        shape: 'ball',
        colorIndex: 6,
        set: {
          interval: 4,
          count: 2,
          angleStep: 13,
          spinDirection: -1,
          angleBase: 180,
          bullet: { speed: 2.4 },
        },
      }),
    ]),
  ])
}

/** 03 — aimed vs fixed fans, with the boss moving to show the difference. */
function lesson03(): Project {
  const boss = emitter('Boss', 0, -130, [
    pat('aim', {
      name: '自機狙い 5way',
      from: 0.5,
      to: 9,
      color: 'YELLOW',
      shape: 'rice',
      colorIndex: 2,
      set: { interval: 26, count: 5, angleSpread: 30, aimPlayer: true, bullet: { speed: 3 } },
    }),
    pat('nway', {
      name: '固定 11way',
      from: 3,
      to: 9,
      color: 'BLUE',
      shape: 'scale',
      colorIndex: 5,
      set: { interval: 75, count: 11, angleSpread: 150, bullet: { speed: 2 } },
    }),
  ])
  boss.keys.x = keys([
    [0, 0],
    [2.5, -110],
    [5, 110],
    [8, 0],
  ])
  return project('03_自機狙いとNWay', [boss], 9)
}

/** 04 — the rotate modifier: same shot, bent at different ages. */
function lesson04(): Project {
  return project(
    '04_曲がる弾（回転）',
    [
      emitter('Boss', 0, -140, [
        pat('circle', {
          name: '早く曲がる',
          from: 0.5,
          to: 9,
          color: 'RED',
          shape: 'ball',
          colorIndex: 1,
          set: { interval: 80, count: 14, bullet: { speed: 2.4, life: 400 } },
          mods: [{ type: 'rotate', patch: { at: 25, duration: 80, amount: 1.4 } }],
        }),
        pat('circle', {
          name: '遅れて逆に曲がる',
          from: 1.2,
          to: 9,
          color: 'SKY',
          shape: 'ball',
          colorIndex: 3,
          set: { interval: 80, count: 14, bullet: { speed: 2.4, life: 400 } },
          mods: [{ type: 'rotate', patch: { at: 70, duration: 80, amount: -1.4 } }],
        }),
      ]),
    ],
    9,
  )
}

/** 05 — gravity: fire upward and let it fall back. */
function lesson05(): Project {
  return project(
    '05_噴水（重力）',
    [
      emitter('Boss', 0, 40, [
        pat('nway', {
          name: '噴き上げ',
          from: 0.5,
          to: 9,
          color: 'SKY',
          shape: 'ball',
          colorIndex: 3,
          set: {
            interval: 8,
            count: 3,
            angleBase: 270,
            angleSpread: 60,
            bullet: { speed: 4.2, speedRand: 0.6, life: 400 },
          },
          mods: [{ type: 'gravity', patch: { at: 0, duration: 400, amount: 0.075 } }],
        }),
        pat('nway', {
          name: '途中で重力が切れる',
          from: 4,
          to: 9,
          color: 'ORANGE',
          shape: 'rice',
          colorIndex: 2,
          set: {
            interval: 30,
            count: 5,
            angleBase: 270,
            angleSpread: 100,
            bullet: { speed: 3.6, life: 400 },
          },
          mods: [{ type: 'gravity', patch: { at: 0, duration: 70, amount: 0.09 } }],
        }),
      ]),
    ],
    9,
  )
}

/** 06 — split, and why you usually destroy the parent right after. */
function lesson06(): Project {
  return project(
    '06_分裂弾',
    [
      emitter('Boss', 0, -140, [
        pat('circle', {
          name: '親を消す',
          from: 0.5,
          to: 9,
          color: 'RED',
          shape: 'ballLarge',
          colorIndex: 1,
          set: { interval: 75, count: 5, bullet: { speed: 1.9, life: 300 } },
          mods: [
            { type: 'split', patch: { at: 42, amount: 7, amount2: 100 } },
            { type: 'destroy', patch: { at: 43 } },
          ],
        }),
        pat('nway', {
          name: '親を残す',
          from: 3,
          to: 9,
          color: 'GREEN',
          shape: 'ballLarge',
          colorIndex: 4,
          set: {
            interval: 75,
            count: 3,
            angleBase: 90,
            angleSpread: 70,
            bullet: { speed: 1.6, life: 340 },
          },
          mods: [{ type: 'split', patch: { at: 60, amount: 5, amount2: 70 } }],
        }),
      ]),
    ],
    9,
  )
}

/** 07 — fade and scale, the two "atmosphere" modifiers. */
function lesson07(): Project {
  return project(
    '07_消える弾・膨らむ弾',
    [
      // Both patterns are tuned so the bullets cross the player line first and
      // only fade out afterwards — a modifier demo you can still read as danmaku.
      emitter('Boss', -80, -110, [
        pat('random', {
          name: '消える霧',
          from: 0.5,
          to: 9,
          color: 'WHITE',
          shape: 'orb',
          colorIndex: 7,
          set: {
            interval: 4,
            count: 3,
            angleRandom: 180,
            bullet: { speed: 1.6, life: 340, blend: 'add' },
          },
          mods: [{ type: 'fade', patch: { at: 190, duration: 70, amount: 0 } }],
        }),
      ]),
      emitter('Boss2', 80, -110, [
        pat('circle', {
          name: '膨らむ弾',
          from: 0.5,
          to: 9,
          color: 'PURPLE',
          shape: 'orb',
          colorIndex: 6,
          set: { interval: 50, count: 8, bullet: { speed: 1.9, life: 340, scale: 0.6 } },
          mods: [
            { type: 'scale', patch: { at: 20, duration: 110, amount: 2.6 } },
            { type: 'fade', patch: { at: 165, duration: 55, amount: 0 } },
          ],
        }),
      ]),
    ],
    9,
  )
}

/** 08 — straight lasers: telegraph first, beam second. */
function lesson08(): Project {
  const boss = emitter('Boss', 0, -160, [
    pat('laser', {
      name: '予告つきレーザー',
      from: 0.5,
      to: 9.5,
      color: 'RED',
      shape: 'ball',
      colorIndex: 1,
      set: {
        interval: 110,
        count: 5,
        angleSpread: 160,
        angleStep: 21,
        laserType: 'straight',
        laserDelay: 75,
        laserLength: 480,
        laserWidth: 18,
        bullet: { life: 55 },
      },
    }),
    pat('circle', {
      name: '隙間を埋める弾',
      from: 1.5,
      to: 9.5,
      color: 'BLUE',
      shape: 'ball',
      colorIndex: 5,
      set: { interval: 40, count: 9, bullet: { speed: 1.7 } },
    }),
  ])
  return project('08_固定レーザー（予告線）', [boss])
}

/** 09 — loose lasers: the needle that grows out of the muzzle. */
function lesson09(): Project {
  const boss = emitter('Boss', 0, -150, [
    pat('laser', {
      name: 'まち針',
      from: 0.5,
      to: 9.5,
      color: 'SKY',
      shape: 'ball',
      colorIndex: 3,
      set: {
        interval: 7,
        count: 2,
        angleStep: 17,
        laserType: 'loose',
        laserLength: 70,
        laserWidth: 7,
        bullet: { speed: 5.2, life: 200, delay: 0 },
      },
    }),
    pat('laser', {
      name: '長い光の帯',
      from: 4,
      to: 9.5,
      color: 'PURPLE',
      shape: 'ball',
      colorIndex: 6,
      set: {
        interval: 65,
        count: 6,
        angleSpread: 200,
        laserType: 'loose',
        laserLength: 240,
        laserWidth: 13,
        bullet: { speed: 3, life: 260, delay: 0 },
      },
    }),
  ])
  boss.keys.x = keys([
    [0, -70],
    [5, 70],
    [10, -70],
  ])
  return project('09_まち針レーザー', [boss])
}

/** 10 — everything at once, arranged as a short spell. */
function lesson10(): Project {
  const boss = emitter('Boss Main', 0, -150, [
    pat('spiral', {
      name: '土台のスパイラル',
      from: 0.5,
      to: 14,
      color: 'PURPLE',
      shape: 'ball',
      colorIndex: 0,
      set: { interval: 6, count: 3, angleStep: 11, radius: 24, bullet: { speed: 2.2 } },
    }),
    pat('laser', {
      name: '予告レーザー',
      from: 3,
      to: 14,
      color: 'RED',
      shape: 'ball',
      colorIndex: 1,
      set: {
        interval: 150,
        count: 4,
        angleSpread: 150,
        angleStep: 33,
        laserType: 'straight',
        laserDelay: 80,
        laserLength: 480,
        laserWidth: 16,
        bullet: { life: 60 },
      },
    }),
    pat('laser', {
      name: 'まち針',
      from: 6,
      to: 14,
      color: 'SKY',
      shape: 'ball',
      colorIndex: 3,
      set: {
        interval: 10,
        count: 1,
        angleStep: 47,
        laserType: 'loose',
        laserLength: 60,
        laserWidth: 6,
        bullet: { speed: 5, life: 200, delay: 0 },
      },
    }),
  ])
  boss.keys.x = keys([
    [0, 0],
    [3.5, -95],
    [7, 95],
    [10.5, -95],
    [14, 0],
  ])

  const left = emitter('Sub Left', -120, -40, [
    pat('circle', {
      name: '分裂弾',
      from: 8,
      to: 14,
      color: 'GREEN',
      shape: 'ballLarge',
      colorIndex: 4,
      set: { interval: 90, count: 4, bullet: { speed: 1.6, life: 300 } },
      mods: [
        { type: 'split', patch: { at: 50, amount: 6, amount2: 90 } },
        { type: 'destroy', patch: { at: 51 } },
      ],
    }),
  ])
  const right = emitter('Sub Right', 120, -40, [
    pat('random', {
      name: '消える霧',
      from: 10,
      to: 14,
      color: 'WHITE',
      shape: 'orb',
      colorIndex: 7,
      set: {
        interval: 5,
        count: 2,
        angleRandom: 180,
        bullet: { speed: 1.7, life: 320, blend: 'add' },
      },
      mods: [{ type: 'fade', patch: { at: 165, duration: 60, amount: 0 } }],
    }),
  ])

  return project('10_総合スペル', [boss, left, right], 14)
}

/** 11 — walls as a trigger: a bouncing bullet fires a laser burst on impact. */
function lesson11(): Project {
  const boss = emitter('Boss', 0, -150, [
    pat('circle', {
      name: '跳ね返る弾',
      from: 0.5,
      to: 9.5,
      color: 'SKY',
      shape: 'ball',
      colorIndex: 3,
      set: {
        interval: 65,
        count: 3,
        bullet: { speed: 3.4, life: 900, wallBehavior: 'bounce', wallBounces: 0 },
      },
      mods: [
        {
          type: 'split',
          patch: {
            trigger: 'wall',
            at: 1,
            child: {
              ...defaultSplitChild(),
              type: 'laser',
              laserType: 'straight',
              count: 3,
              angleSpread: 100,
              laserLength: 260,
              laserWidth: 14,
              laserDelay: 18,
              life: 45,
              shotDataId: 'BGW_BALL_S_RED',
            },
          },
        },
      ],
    }),
    pat('circle', {
      name: 'ゆっくり跳ね返る弾',
      from: 2,
      to: 9.5,
      color: 'PURPLE',
      shape: 'orb',
      colorIndex: 6,
      set: {
        interval: 130,
        count: 2,
        bullet: { speed: 2, life: 900, wallBehavior: 'bounce', wallBounces: 0 },
      },
      mods: [
        {
          type: 'split',
          patch: {
            trigger: 'wall',
            at: 1,
            child: {
              ...defaultSplitChild(),
              type: 'laser',
              laserType: 'loose',
              count: 4,
              angleSpread: 360,
              laserLength: 90,
              laserWidth: 8,
              inheritSpeed: false,
              speed: 4.5,
              life: 160,
              shotDataId: 'BGW_KUNAI_YELLOW',
            },
          },
        },
      ],
    }),
  ])
  return project('11_壁でレーザーに変わる弾', [boss], 10)
}

// ---------------------------------------------------------------------------
// リファレンス
// ---------------------------------------------------------------------------

/** Every silhouette side by side, for picking a shot graphic. */
function shapeCatalogue(): Project {
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
  // One column per shape, each firing straight down, so every silhouette can be
  // watched crossing the whole field instead of sitting in a corner.
  const emitters = shapes.map(([shape, color, label], i) => {
    const x = -160 + i * 32
    return emitter(label, x, -195, [
      pat('nway', {
        name: label,
        from: i * 0.12,
        to: 10,
        color,
        shape,
        colorIndex: i,
        set: {
          interval: 34,
          count: 1,
          angleBase: 90,
          bullet: { speed: 1.9, life: 400, delay: 0 },
        },
      }),
    ])
  })
  return project('弾の種類カタログ', emitters)
}

/** The original showcase project. */
function openingSpell(): Project {
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
      to: 9,
      color: 'ORANGE',
      shape: 'ball',
      colorIndex: 2,
      set: {
        interval: 120,
        count: 4,
        angleSpread: 120,
        laserType: 'straight',
        laserDelay: 70,
        laserLength: 460,
        bullet: { life: 55 },
      },
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

// ---------------------------------------------------------------------------

export const SAMPLES: Sample[] = [
  {
    id: 'l00',
    lesson: 0,
    name: '00_はじめの一発',
    description: 'エミッター1つ・パターン1つだけ。全方位に等間隔で撃つ、いちばん素の形。',
    tip: '触るのは「弾数」と「弾間隔」の2つだけ。弾数を増やすと壁になり、弾間隔を縮めるとテンポが速くなる。両方上げるとすぐ画面が埋まるので、片方ずつ動かすのがコツ。',
    tags: ['Circle', '入門'],
    build: lesson00,
  },
  {
    id: 'l01',
    lesson: 1,
    name: '01_弾を層にする',
    description: '同じリングを速度違いで3層に重ねる。半径をつけたリングとの違いも並べてある。',
    tip: 'レイヤーは「同じ形を速度差で重ねる」機能。レイヤー速度差を0にすると全部重なって1層に見える。半径は発射位置を外に押し出すので、太い輪が広がる見た目になる。',
    tags: ['レイヤー', 'Ring', '速度差'],
    build: lesson01,
  },
  {
    id: 'l02',
    lesson: 2,
    name: '02_スパイラルの作り方',
    description: '右回りと左回りのスパイラルを同時に出して、腕の重なりを見る。',
    tip: 'スパイラルは「1回撃つたびに角度を少しずらす」だけ。スパイラル角度 × 弾間隔で腕の巻きが決まる。スパイラル角度を 360÷弾数 の近くにすると腕が止まって見え、少しずらすとゆっくり回る。',
    tags: ['Spiral', '回転方向'],
    build: lesson02,
  },
  {
    id: 'l03',
    lesson: 3,
    name: '03_自機狙いとNWay',
    description: '自機狙い5wayと固定11way。ボスが左右に動くので違いがはっきり出る。',
    tip: '自機狙いは撃つ瞬間の自機位置が基準なので、動くと形が毎回変わる。固定NWayはいつも同じ形。この2つを重ねると「避け方を強制する層」と「置きに行く層」になる。',
    tags: ['Aim', 'NWay', 'キーフレーム'],
    build: lesson03,
  },
  {
    id: 'l04',
    lesson: 4,
    name: '04_曲がる弾（回転）',
    description: '回転モディファイアを、効き始めるタイミングと向きを変えて2種類。',
    tip: 'モディファイアの「開始F」は弾が生まれてから何フレーム後かを指す。同じ弾でも開始Fをずらすと、同時に撃った弾が時間差で曲がり出して渦になる。継続Fを過ぎると曲がるのを止めて直進に戻る。',
    tags: ['回転', 'モディファイア'],
    build: lesson04,
  },
  {
    id: 'l05',
    lesson: 5,
    name: '05_噴水（重力）',
    description: '上向きに撃った弾を重力で落とす。重力が途中で切れるパターンも並べてある。',
    tip: '重力は上向き（基準角度270）に撃つと放物線になる。継続Fを短くすると途中で重力が切れて、そこから直進に戻る＝「落ちてきて横に流れる」動きが作れる。ランダム速度を少し足すと自然にばらける。',
    tags: ['重力', '噴水'],
    build: lesson05,
  },
  {
    id: 'l06',
    lesson: 6,
    name: '06_分裂弾',
    description: '分裂したあと親を消す場合と、残す場合の比較。',
    tip: '分裂の直後（1フレーム後）に「消滅」を置くと親が消えて、割れた見た目になる。置かないと親も飛び続けるので弾が増えすぎやすい。子弾はモディファイアを引き継がない（＝再分裂もしないし、親の「消滅」で巻き添えにもならない）。これは ph3 出力側でも同じで、生成される分裂コードは子弾に制御タスクを付けない。',
    tags: ['分裂', '消滅'],
    build: lesson06,
  },
  {
    id: 'l07',
    lesson: 7,
    name: '07_消える弾・膨らむ弾',
    description: 'フェードで消える霧と、拡縮で膨らんでから消える弾。',
    tip: 'フェードは目標αまで補間する。0にすると消える＝画面を汚さずに雰囲気だけ足せる。拡縮と組み合わせて「膨らみながら薄くなる」にすると爆発に見える。ブレンドを加算にすると光って見えるので、この2つとは相性がいい。',
    tags: ['フェード', '拡縮', '加算'],
    build: lesson07,
  },
  {
    id: 'l08',
    lesson: 8,
    name: '08_固定レーザー（予告線）',
    description: '細い予告線が出てから実体化する固定式レーザー。隙間に通常弾を混ぜてある。',
    tip: '固定式は「予告線の長さ（F）」だけ細い線が点滅し、そのあと太いビームになる。予告を長くすると避けやすく、短くすると厳しくなる。ビームが残る時間は弾の「寿命」。ph3 では CreateStraightLaserA1 の遅延引数にそのまま対応する。',
    tags: ['レーザー', '予告線', '固定式'],
    build: lesson08,
  },
  {
    id: 'l09',
    lesson: 9,
    name: '09_まち針レーザー',
    description: '発射元から伸びながら飛ぶ射出式レーザー。短い「まち針」と長い光の帯の2種類。',
    tip: '射出式は撃った瞬間は長さ0で、進みながらレーザー長まで伸びる。レーザー長を短く・速度を速くするといわゆるまち針。長くして遅くすると光の帯になる。ph3 では CreateLooseLaserA1。',
    tags: ['レーザー', 'まち針', '射出式'],
    build: lesson09,
  },
  {
    id: 'l10',
    lesson: 10,
    name: '10_総合スペル',
    description: '移動するボスにスパイラル・予告レーザー・まち針・分裂・フェードを重ねた14秒。',
    tip: '重ねる順番が大事。土台に細かいスパイラル、区切りに予告レーザー、間を埋めるまち針、という具合に「常時・周期・単発」を分けて考えると崩れにくい。タイムラインで各クリップの開始をずらして、切り替わりを作っている。',
    tags: ['総合', 'レーザー', 'キーフレーム'],
    build: lesson10,
  },
  {
    id: 'l11',
    lesson: 11,
    name: '11_壁でレーザーに変わる弾',
    description: '壁で跳ね返る弾が、当たった瞬間だけレーザーを噴き出す。分裂の子弾に laser を選んだ例。',
    tip: '分裂モディファイアの「トリガー」を壁に当たった時・何回目=1にすると、最初の跳ね返りだけでレーザーが出る（2回目以降は再発火しない）。子弾の種類はパターンライブラリと同じ一覧から選べるので、扇形の分裂の代わりに固定式・射出式レーザーを割り当てられる。親弾自体は跳ね返り続けるので、画面が薄まらずに済む。',
    tags: ['壁', '分裂', 'レーザー'],
    build: lesson11,
  },
  {
    id: 'shape-catalogue',
    name: '弾の種類カタログ',
    description: '11種類の弾の形を並べたもの。ShotDataID の当たりをつけるのに使う。',
    tip: 'ダークテーマで開くと形の違いがいちばん見やすい。鱗弾・米弾・札・楕円弾・蝶弾・ナイフは進行方向を向く。',
    tags: ['弾の形', 'リファレンス'],
    build: shapeCatalogue,
  },
  {
    id: 'opening-spell',
    name: '紅魔館ステージ_パターン01',
    description: '3エミッター6パターンの総合見本。エディタの初期状態。',
    tip: '各パターンを選ぶと、タイムラインでどの尺に置かれているかが見える。',
    tags: ['総合', 'リファレンス'],
    build: openingSpell,
  },
]

export const LESSONS = SAMPLES.filter((s) => s.lesson !== undefined).sort(
  (a, b) => (a.lesson ?? 0) - (b.lesson ?? 0),
)
export const REFERENCES = SAMPLES.filter((s) => s.lesson === undefined)

/** The project a fresh editor session starts from. */
export function createProject(): Project {
  return openingSpell()
}
