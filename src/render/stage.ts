import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  TextStyle,
} from 'pixi.js'
import type { SimBullet, SimSnapshotView } from '../engine/types'
import type { BulletShape, ProjectSettings } from '../types/dmk'
import { shotRect, type ShotSheet } from '../io/shotData'
import { SHAPES, traceShape } from '../types/shapes'

interface SheetBucket {
  texture: Texture
  container: Container
  sprites: Sprite[]
  used: number
}

interface ShapeBucket {
  rimTexture: Texture
  coreTexture: Texture
  rimContainer: Container
  coreContainer: Container
  rims: Sprite[]
  cores: Sprite[]
  used: number
}

/** Texture resolution of the longest silhouette axis. */
const TEX_SIZE = 96

export interface RenderOptions {
  showGrid: boolean
  showHitbox: boolean
  showTrails: boolean
  selectedEmitterId: string | null
  dark: boolean
  /** where 自機 actually is — differs from settings.playerX/Y during play mode */
  playerPos: { x: number; y: number }
}

interface Palette {
  bg: number
  grid: number
  gridMajor: number
  frame: number
  player: number
  label: number
}

/**
 * The stage is always dark, in both UI themes.
 *
 * Danmaku art is authored for a dark playfield: additive shots add light, so on
 * a near-white background they wash out completely. Keeping the stage dark is
 * the only way the preview can tell the truth about what ph3 will draw.
 */
const STAGE: Palette = {
  bg: 0x0f0e16,
  grid: 0x222030,
  gridMajor: 0x2f2b45,
  frame: 0x453f66,
  player: 0x9b81ff,
  label: 0xa8a5be,
}

/**
 * PixiJS renderer. Keeps a sprite pool mirroring the bullet pool so no display
 * objects are created during playback. Unaware of React and of the simulator's
 * internals — it only consumes a SimSnapshotView.
 */
export class StageRenderer {
  app = new Application()
  private world = new Container()
  private gridLayer = new Graphics()
  private trailLayer = new Graphics()
  private laserLayer = new Graphics()
  /** coloured outer silhouettes */
  private rimLayer = new Container()
  /** white inner cores, drawn on top of every rim */
  private coreLayer = new Container()
  private hitboxLayer = new Graphics()
  /** holds the single 自機 sprite — a Graphics layer can't parent a Sprite */
  private playerLayer = new Container()
  private playerSprite: Sprite | null = null
  private guideLayer = new Graphics()
  private markerLayer = new Container()
  private markers: { g: Graphics; label: Text }[] = []
  /** one bucket per shape so each shape stays a single draw batch */
  private buckets = new Map<BulletShape, ShapeBucket>()
  /** real ph3 sprites, one bucket per shot id (all share the sheet texture) */
  private sheetLayer = new Container()
  private sheetBuckets = new Map<number, SheetBucket>()
  private sheetBase: Texture | null = null
  private sheet: ShotSheet | null = null
  private resizeObserver: ResizeObserver | null = null
  private host: HTMLDivElement | null = null
  private destroyed = false
  private lastW = 0
  private lastH = 0
  private ready = false
  private palette: Palette = STAGE
  private gridKey = ''

  /** user view transform (pan / zoom tools) */
  zoom = 1
  panX = 0
  panY = 0
  private fitScale = 1

  async init(host: HTMLDivElement) {
    await this.app.init({
      background: STAGE.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
      // resizeTo also wires up Pixi's own resize plugin; dropping it leaves the
      // plugin half-initialised and destroy() then throws.
      resizeTo: host,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
    })
    host.appendChild(this.app.canvas)

    // `resizeTo` only reacts to window resizes, so it misses layout changes
    // like switching to the narrow shell. The observer is the fast path;
    // `layout()` re-checks every frame so a missed notification can't leave the
    // canvas stuck at the wrong size.
    this.host = host
    this.lastW = Math.max(1, host.clientWidth)
    this.lastH = Math.max(1, host.clientHeight)
    this.resizeObserver = new ResizeObserver(() => this.syncSize())
    this.resizeObserver.observe(host)
    this.app.stage.addChild(this.world)
    this.world.addChild(
      this.gridLayer,
      this.trailLayer,
      this.laserLayer,
      this.rimLayer,
      this.coreLayer,
      this.sheetLayer,
      this.hitboxLayer,
      // sprite first, then the hitbox-style guide small on top of it
      this.playerLayer,
      this.guideLayer,
      this.markerLayer,
    )
    this.ready = true
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.ready = false
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.host = null
    this.sheetBuckets.clear()
    try {
      // Pixi can throw here (e.g. tearing down a half-initialised plugin). A
      // failure to release GPU objects must not break React's cleanup chain,
      // or every effect queued after this one silently stops running.
      this.app.destroy(true, { children: true, texture: true })
    } catch (err) {
      console.warn('StageRenderer.destroy', err)
    }
  }

  get isReady() {
    return this.ready
  }

  /**
   * Bullets are drawn as two stacked silhouettes — a tinted outer shape with a
   * white core on top, the classic Touhou shot look. Textures are built per
   * shape on first use and shared by every bullet of that shape.
   */
  private silhouetteTexture(shape: BulletShape, coreScale: number): Texture {
    const spec = SHAPES[shape]
    const w = TEX_SIZE
    const h = Math.round(TEX_SIZE / spec.aspect)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const rx = (w / 2) * 0.94 * coreScale
    const ry = (h / 2) * 0.94 * coreScale

    // soft outer falloff so edges stay smooth when scaled up
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(255,255,255,0.85)'
    ctx.shadowBlur = TEX_SIZE * 0.04
    traceShape(ctx, shape, w / 2, h / 2, rx, ry)
    ctx.fill()
    ctx.shadowBlur = 0
    traceShape(ctx, shape, w / 2, h / 2, rx, ry)
    ctx.fill()
    return Texture.from(c)
  }

  /**
   * Adopt a parsed ph3 shot sheet. From here on any bullet whose ShotDataID
   * resolves to an id in this sheet is drawn with the real sprite instead of a
   * procedural silhouette — what you see is what ph3 will draw.
   */
  setShotSheet(sheet: ShotSheet | null, image: HTMLCanvasElement | null) {
    for (const b of this.sheetBuckets.values()) b.container.destroy({ children: true })
    this.sheetBuckets.clear()
    // Don't destroy the old base texture: Texture.from() hands back a cached
    // instance that other renderers (and a remount) may still be using.
    this.sheetBase = image ? Texture.from(image) : null
    this.sheet = image ? sheet : null
  }

  get hasShotSheet() {
    return this.sheet !== null && this.sheetBase !== null
  }

  /**
   * 自機 is a fixed sprite, not a pool — there's only ever one on stage — so
   * it's built once here rather than per-frame like the bullet buckets.
   * Only the top-left 64×64 cell of the 512×256 (8×4) sheet is used; no
   * animation.
   */
  setPlayerSprite(image: HTMLCanvasElement | HTMLImageElement | null) {
    if (this.playerSprite) {
      this.playerSprite.destroy()
      this.playerSprite = null
    }
    if (!image) return
    const base = Texture.from(image)
    const texture = new Texture({ source: base.source, frame: new Rectangle(0, 0, 64, 64) })
    const sp = new Sprite(texture)
    sp.anchor.set(0.5)
    sp.scale.set(0.75)
    this.playerLayer.addChild(sp)
    this.playerSprite = sp
  }

  private sheetBucket(shotId: number): SheetBucket | null {
    const existing = this.sheetBuckets.get(shotId)
    if (existing) return existing
    const shot = this.sheet?.shots.get(shotId)
    const base = this.sheetBase
    if (!shot || !base) return null
    const r = shotRect(shot)
    if (!r) return null

    const left = Math.min(r.left, r.right)
    const top = Math.min(r.top, r.bottom)
    const w = Math.abs(r.right - r.left)
    const h = Math.abs(r.bottom - r.top)
    if (w <= 0 || h <= 0) return null

    const container = new Container()
    this.sheetLayer.addChild(container)
    // Inset by half a texel. The sheet is tightly packed, so a frame sampled
    // with linear filtering reaches into the neighbouring cell and drags a
    // sliver of the wrong sprite along the edge.
    const inset = 0.5
    const bucket: SheetBucket = {
      texture: new Texture({
        source: base.source,
        frame: new Rectangle(left + inset, top + inset, w - inset * 2, h - inset * 2),
      }),
      container,
      sprites: [],
      used: 0,
    }
    this.sheetBuckets.set(shotId, bucket)
    return bucket
  }

  /** Sprite rotation for a sheet shot, honouring fixed_angle / angular_velocity. */
  private sheetRotation(shotId: number, travelAngleDeg: number, age: number): number {
    const shot = this.sheet?.shots.get(shotId)
    if (!shot) return 0
    const spin = shot.angularVelocity * age
    const base = shot.fixedAngle ? 0 : travelAngleDeg + 90
    return ((base + spin) * Math.PI) / 180
  }

  private bucket(shape: BulletShape): ShapeBucket {
    let b = this.buckets.get(shape)
    if (b) return b
    const rimContainer = new Container()
    const coreContainer = new Container()
    this.rimLayer.addChild(rimContainer)
    this.coreLayer.addChild(coreContainer)
    b = {
      rimTexture: this.silhouetteTexture(shape, 1),
      coreTexture: this.silhouetteTexture(shape, SHAPES[shape].coreRatio),
      rimContainer,
      coreContainer,
      rims: [],
      cores: [],
      used: 0,
    }
    this.buckets.set(shape, b)
    return b
  }

  /**
   * The UI theme does not reach the stage — see STAGE above. Kept as a method
   * so callers don't have to know that, and so a future "light stage" option
   * has somewhere to live.
   */
  setTheme(_dark: boolean) {
    if (this.palette === STAGE) return
    this.palette = STAGE
    if (this.ready) {
      this.app.renderer.background.color = STAGE.bg
      this.gridKey = ''
    }
  }

  fit() {
    this.zoom = 1
    this.panX = 0
    this.panY = 0
  }

  /** Screen (canvas px) → stage coordinates. */
  toStage(sx: number, sy: number): { x: number; y: number } {
    const s = this.fitScale * this.zoom
    return {
      x: (sx - this.world.position.x) / s,
      y: (sy - this.world.position.y) / s,
    }
  }

  /** Match the drawing buffer to the host box. Cheap when nothing changed. */
  private syncSize() {
    if (!this.ready || !this.host) return
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    if (w === this.lastW && h === this.lastH) return
    this.lastW = w
    this.lastH = h
    this.app.renderer.resize(w, h)
  }

  layout(settings: ProjectSettings) {
    if (!this.ready) return
    this.syncSize()
    const w = this.app.renderer.width / this.app.renderer.resolution
    const h = this.app.renderer.height / this.app.renderer.resolution
    this.fitScale = Math.min(w / settings.stageWidth, h / settings.stageHeight) * 0.9
    const s = this.fitScale * this.zoom
    this.world.scale.set(s)
    this.world.position.set(w / 2 + this.panX, h / 2 + this.panY)

    const key = `${settings.stageWidth}x${settings.stageHeight}:${this.palette.bg}`
    if (key !== this.gridKey) {
      this.gridKey = key
      this.drawGrid(settings)
    }
  }

  private drawGrid(s: ProjectSettings) {
    const g = this.gridLayer
    const hw = s.stageWidth / 2
    const hh = s.stageHeight / 2
    g.clear()
    for (let x = -hw; x <= hw; x += 32) g.moveTo(x, -hh).lineTo(x, hh)
    for (let y = -hh; y <= hh; y += 32) g.moveTo(-hw, y).lineTo(hw, y)
    g.stroke({ color: this.palette.grid, width: 1 })
    g.moveTo(-hw, 0).lineTo(hw, 0).moveTo(0, -hh).lineTo(0, hh)
    g.stroke({ color: this.palette.gridMajor, width: 1 })
    g.rect(-hw, -hh, s.stageWidth, s.stageHeight)
    g.stroke({ color: this.palette.frame, width: 1.5 })
  }

  render(view: SimSnapshotView, opts: RenderOptions) {
    if (!this.ready) return
    this.gridLayer.visible = opts.showGrid
    this.renderBullets(view, opts)
    this.renderMarkers(view, opts.selectedEmitterId)
    this.renderGuides(opts.playerPos)
  }

  /** Frames a straight laser takes to swell from telegraph to full width. */
  private static readonly MATERIALISE = 6

  /**
   * 固定式 (kind 1) — anchored at the source. Shows a thin 予告線 for
   * `telegraph` frames, then swells into the real beam.
   * 射出式 (kind 2) — まち針. Grows out of the muzzle up to `laserLength`
   * and travels, so the tail follows the head once it is fully extended.
   */
  private drawLaser(b: SimBullet, opts: RenderOptions) {
    const rad = (b.angle * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    const fullWidth = b.laserWidth * b.scale
    const g = this.laserLayer

    let ax: number, ay: number, bx: number, by: number
    let width: number
    let alpha: number
    let telegraphing = false

    if (b.kind === 1) {
      ax = b.x
      ay = b.y
      bx = b.x + dx * b.laserLength
      by = b.y + dy * b.laserLength
      telegraphing = b.delay > 0
      if (telegraphing) {
        width = Math.max(1, fullWidth * 0.09)
        // gentle pulse so the warning reads as "something is coming"
        const t = (b.telegraph - b.delay) / Math.max(1, b.telegraph)
        alpha = (0.22 + 0.16 * Math.sin(t * Math.PI * 6)) * b.alpha
      } else {
        const since = b.age - b.telegraph
        const swell = Math.min(1, (since + 1) / StageRenderer.MATERIALISE)
        // overshoot slightly on the first frames — the classic materialise flash
        const flash = swell < 1 ? 1 + (1 - swell) * 0.9 : 1
        width = fullWidth * swell * flash
        alpha = (0.45 + 0.35 * (1 - swell)) * b.alpha
      }
    } else {
      // loose: the segment grows from the muzzle until it reaches full length
      const len = Math.min(b.laserLength, b.travel)
      bx = b.x
      by = b.y
      ax = b.x - dx * len
      ay = b.y - dy * len
      width = fullWidth
      alpha = 0.5 * b.alpha
      if (b.delay > 0) {
        width = fullWidth * 0.12
        alpha = 0.3 * b.alpha
      }
    }

    if (width <= 0) return

    g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: b.color, width, alpha, cap: 'round' })
    if (!telegraphing) {
      g.moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ color: 0xffffff, width: width * 0.45, alpha: 0.85 * b.alpha, cap: 'round' })
      // bright muzzle / head glow
      const hx = b.kind === 2 ? bx : ax
      const hy = b.kind === 2 ? by : ay
      g.circle(hx, hy, width * 0.75).fill({ color: 0xffffff, alpha: 0.5 * b.alpha })
    }

    if (opts.showHitbox && !telegraphing) {
      this.hitboxLayer
        .moveTo(ax, ay)
        .lineTo(bx, by)
        .stroke({ color: 0xff4d6a, width: 1, alpha: 0.5 })
    }
  }

  private renderBullets(view: SimSnapshotView, opts: RenderOptions) {
    const bullets = view.bullets
    this.laserLayer.clear()
    this.trailLayer.clear()
    this.hitboxLayer.clear()
    for (const b of this.buckets.values()) b.used = 0
    for (const b of this.sheetBuckets.values()) b.used = 0

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]

      if (b.kind === 1 || b.kind === 2) {
        this.drawLaser(b, opts)
        continue
      }

      if (opts.showTrails && b.delay <= 0) {
        this.trailLayer
          .moveTo(b.px - (b.x - b.px) * 5, b.py - (b.y - b.py) * 5)
          .lineTo(b.x, b.y)
          .stroke({ color: b.color, width: 1.5 * b.scale, alpha: 0.18 * b.alpha })
      }

      // Real ph3 sprite when the ShotDataID resolved against a loaded sheet.
      // These are already coloured, so no tint and no white core overlay.
      const sheetBucket = b.shotId > 0 ? this.sheetBucket(b.shotId) : null
      if (sheetBucket) {
        const si = sheetBucket.used
        let sp = sheetBucket.sprites[si]
        if (!sp) {
          sp = new Sprite(sheetBucket.texture)
          sp.anchor.set(0.5)
          sheetBucket.container.addChild(sp)
          sheetBucket.sprites[si] = sp
        }
        const spawning = b.delay > 0
        sp.visible = true
        sp.x = b.x
        sp.y = b.y
        sp.rotation = this.sheetRotation(b.shotId, b.angle, b.age)
        sp.scale.set(b.scale * (spawning ? 1.7 + b.delay * 0.07 : 1))
        sp.alpha = spawning ? 0.35 : b.alpha
        sp.blendMode = b.additive ? 'add' : 'normal'
        sheetBucket.used++
        if (opts.showHitbox && !spawning) {
          this.hitboxLayer.circle(b.x, b.y, b.hitbox * b.scale)
        }
        continue
      }

      const shape = b.shape as BulletShape
      const spec = SHAPES[shape] ?? SHAPES.ball
      const bucket = this.bucket(shape in SHAPES ? shape : 'ball')
      const si = bucket.used

      let rim = bucket.rims[si]
      let core = bucket.cores[si]
      if (!rim) {
        rim = new Sprite(bucket.rimTexture)
        rim.anchor.set(0.5)
        bucket.rimContainer.addChild(rim)
        bucket.rims[si] = rim
        core = new Sprite(bucket.coreTexture)
        core.anchor.set(0.5)
        bucket.coreContainer.addChild(core)
        bucket.cores[si] = core
      }

      const spawning = b.delay > 0
      const delayScale = spawning ? 1.7 + b.delay * 0.07 : 1
      // texture is TEX_SIZE across; map it onto the shape's world radius
      const unit = (spec.radius * 2) / TEX_SIZE
      const rotation = spec.directional ? (b.angle * Math.PI) / 180 : 0

      rim.visible = true
      rim.x = b.x
      rim.y = b.y
      rim.rotation = rotation
      rim.tint = b.color
      rim.scale.set(b.scale * unit * delayScale)
      rim.alpha = spawning ? 0.28 : b.alpha
      rim.blendMode = b.additive ? 'add' : 'normal'

      core.visible = !spawning && spec.coreRatio > 0
      core.x = b.x
      core.y = b.y
      core.rotation = rotation
      core.scale.set(b.scale * unit)
      core.alpha = b.alpha
      core.blendMode = b.additive ? 'add' : 'normal'

      bucket.used++

      if (opts.showHitbox && !spawning) {
        this.hitboxLayer.circle(b.x, b.y, b.hitbox * b.scale)
      }
    }

    if (opts.showHitbox) this.hitboxLayer.stroke({ color: 0xff4d6a, width: 1, alpha: 0.65 })
    for (const bucket of this.buckets.values()) {
      for (let i = bucket.used; i < bucket.rims.length; i++) {
        bucket.rims[i].visible = false
        bucket.cores[i].visible = false
      }
    }
    for (const bucket of this.sheetBuckets.values()) {
      for (let i = bucket.used; i < bucket.sprites.length; i++) bucket.sprites[i].visible = false
    }
  }

  private renderMarkers(view: SimSnapshotView, selected: string | null) {
    const list = view.emitters
    for (let i = 0; i < list.length; i++) {
      let m = this.markers[i]
      if (!m) {
        const g = new Graphics()
        const label = new Text({
          text: '',
          style: new TextStyle({ fill: this.palette.label, fontSize: 9, fontFamily: 'monospace' }),
        })
        label.position.set(12, -5)
        const holder = new Container()
        holder.addChild(g, label)
        this.markerLayer.addChild(holder)
        m = { g, label }
        this.markers[i] = m
      }
      const e = list[i]
      const holder = m.g.parent!
      holder.visible = true
      holder.position.set(e.x, e.y)
      m.label.text = e.name
      m.label.alpha = e.active ? 0.9 : 0.35
      m.label.style.fill = this.palette.label
      const col = e.id === selected ? 0xf59e0b : e.active ? 0x7c5cff : 0xb9b4cc
      m.g.clear()
      m.g.circle(0, 0, 8).stroke({ color: col, width: 1.5 })
      m.g.moveTo(-13, 0).lineTo(13, 0).moveTo(0, -13).lineTo(0, 13)
      m.g.stroke({ color: col, width: 1, alpha: 0.55 })
      const rad = (e.rotation * Math.PI) / 180
      m.g.moveTo(0, 0).lineTo(Math.cos(rad) * 24, Math.sin(rad) * 24)
      m.g.stroke({ color: col, width: 1, alpha: 0.45 })
    }
    for (let i = list.length; i < this.markers.length; i++) {
      const holder = this.markers[i].g.parent
      if (holder) holder.visible = false
    }
  }

  private renderGuides(playerPos: { x: number; y: number }) {
    const g = this.guideLayer
    const c = this.palette.player
    g.clear()
    g.circle(playerPos.x, playerPos.y, 10).stroke({ color: c, width: 1.5 })
    g.circle(playerPos.x, playerPos.y, 3).fill({ color: c })
    g.moveTo(playerPos.x - 16, playerPos.y)
      .lineTo(playerPos.x + 16, playerPos.y)
      .moveTo(playerPos.x, playerPos.y - 16)
      .lineTo(playerPos.x, playerPos.y + 16)
    g.stroke({ color: c, width: 1, alpha: 0.35 })

    if (this.playerSprite) {
      this.playerSprite.visible = true
      this.playerSprite.x = playerPos.x
      this.playerSprite.y = playerPos.y
    }
  }

  /** Snapshot the current frame as a PNG data URL. */
  async capture(): Promise<string | null> {
    if (!this.ready) return null
    this.app.renderer.render(this.app.stage)
    return this.app.renderer.extract.base64(this.app.stage)
  }

  /** The stage rectangle in screen pixels, given the current pan/zoom. */
  stageRect(settings: ProjectSettings): Rectangle {
    const s = this.fitScale * this.zoom
    const w = settings.stageWidth * s
    const h = settings.stageHeight * s
    return new Rectangle(this.world.position.x - w / 2, this.world.position.y - h / 2, w, h)
  }

  /** Background colour as CSS, for compositing extracted frames. */
  get backgroundCss(): string {
    return `#${this.palette.bg.toString(16).padStart(6, '0')}`
  }

  /**
   * Draw the current stage into `ctx` at the given size. Extraction uses an
   * explicit frame so every captured frame shares identical framing — without
   * it Pixi would crop to the bullets' bounding box and the GIF would jitter.
   */
  drawStageInto(ctx: CanvasRenderingContext2D, w: number, h: number, settings: ProjectSettings) {
    this.app.renderer.render(this.app.stage)
    const frame = this.stageRect(settings)
    // Extract at the *output* pixel density, not the on-screen one. Without this
    // a phone-sized canvas would be upscaled into the GIF and come out blurry.
    const resolution = Math.min(4, Math.max(1, w / Math.max(1, frame.width)))
    const src = this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame,
      resolution,
    }) as HTMLCanvasElement
    ctx.fillStyle = this.backgroundCss
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(src, 0, 0, w, h)
  }
}
