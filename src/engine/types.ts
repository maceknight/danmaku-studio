/** 0 = shot, 1 = anchored straight laser, 2 = travelling loose laser */
export type BulletKind = 0 | 1 | 2

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
  /** BulletShape — kept as a plain string so the engine stays UI-agnostic */
  shape: string
  /** numeric ph3 shot id when a shot sheet is loaded, else 0 */
  shotId: number
  /** max length; loose lasers grow up to this */
  laserLength: number
  laserWidth: number
  /** telegraph frames a straight laser was created with (0 for shots) */
  telegraph: number
  /** distance travelled since spawn — drives loose-laser length */
  travel: number
  /** speed a ramp started from; captured on the frame the ramp begins */
  rampFrom: number
  /** age at which the active ramp started, or -1 when none is running */
  rampAt: number
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
    shape: 'ball',
    shotId: 0,
    laserLength: 0,
    laserWidth: 0,
    telegraph: 0,
    travel: 0,
    rampFrom: 0,
    rampAt: -1,
    patternIdx: -1,
    depth: 0,
    fired: 0,
  }
}
