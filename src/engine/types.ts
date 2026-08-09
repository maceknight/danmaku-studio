export type BulletKind = 0 | 1 // 0 = shot, 1 = laser

export interface SimBullet {
  active: boolean
  kind: BulletKind
  x: number
  y: number
  /** previous position — used to draw motion trails */
  px: number
  py: number
  speed: number
  angle: number // degrees
  accel: number
  maxSpeed: number
  angularVelocity: number
  gvx: number
  gvy: number
  age: number
  life: number
  scale: number
  baseScale: number
  alpha: number
  color: number
  additive: boolean
  delay: number
  hitbox: number
  laserLength: number
  laserWidth: number
  /** index into SimState.patterns for modifier lookup */
  patternIdx: number
  /** split generation — children never re-split */
  depth: number
  /** bitmask of one-shot modifiers already applied (max 30 modifiers) */
  fired: number
}

export interface EmitterMarker {
  id: string
  name: string
  x: number
  y: number
  rotation: number
  active: boolean
}

export interface SimSnapshotView {
  frame: number
  bullets: SimBullet[]
  emitters: EmitterMarker[]
  bulletCount: number
}

export function makeBullet(): SimBullet {
  return {
    active: false,
    kind: 0,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    speed: 0,
    angle: 0,
    accel: 0,
    maxSpeed: 0,
    angularVelocity: 0,
    gvx: 0,
    gvy: 0,
    age: 0,
    life: 0,
    scale: 1,
    baseScale: 1,
    alpha: 1,
    color: 0xffffff,
    additive: false,
    delay: 0,
    hitbox: 4,
    laserLength: 0,
    laserWidth: 0,
    patternIdx: -1,
    depth: 0,
    fired: 0,
  }
}
