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
import { SHAPES, traceShape } from '../types/shapes'

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
}

interface Palette {
  bg: number
  grid: number
  gridMajor: number
  frame: number
  player: number
  label: number
}

const LIGHT: Palette = {
  bg: 0xfbfaff,
  grid: 0xece9f8,
  gridMajor: 0xdcd6f2,
  frame: 0xbcb2e6,
  player: 0x7c5cff,
  label: 0x6b6a85,
}

const DARK: Palette = {
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
  private guideLayer = new Graphics()
  private markerLayer = new Container()
  private markers: { g: Graphics; label: Text }[] = []
  /** one bucket per shape so each shape stays a single draw batch */
  private buckets = new Map<BulletShape, ShapeBucket>()
  private resizeObserver: ResizeObserver | null = null
  private host: HTMLDivElement | null = null
  private lastW = 0
  private lastH = 0
  private ready = false
  private palette: Palette = LIGHT
  private gridKey = ''

  /** user view transform (pan / zoom tools) */
  zoom = 1
  panX = 0
  panY = 0
  private fitScale = 1

  async init(host: HTMLDivElement) {
    await this.app.init({
      background: LIGHT.bg,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
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
      this.hitboxLayer,
      this.guideLayer,
      this.markerLayer,
    )
    this.ready = true
  }

  destroy() {
    this.ready = false
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.host = null
    this.app.destroy(true, { children: true, texture: true })
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

  setTheme(dark: boolean) {
    const next = dark ? DARK : LIGHT
    if (next === this.palette) return
    this.palette = next
    if (this.ready) {
      this.app.renderer.background.color = next.bg
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

  render(view: SimSnapshotView, settings: ProjectSettings, opts: RenderOptions) {
    if (!this.ready) return
    this.gridLayer.visible = opts.showGrid
    this.renderBullets(view, opts)
    this.renderMarkers(view, opts.selectedEmitterId)
    this.renderGuides(settings)
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

  private renderGuides(s: ProjectSettings) {
    const g = this.guideLayer
    const c = this.palette.player
    g.clear()
    g.circle(s.playerX, s.playerY, 10).stroke({ color: c, width: 1.5 })
    g.circle(s.playerX, s.playerY, 3).fill({ color: c })
    g.moveTo(s.playerX - 16, s.playerY)
      .lineTo(s.playerX + 16, s.playerY)
      .moveTo(s.playerX, s.playerY - 16)
      .lineTo(s.playerX, s.playerY + 16)
    g.stroke({ color: c, width: 1, alpha: 0.35 })
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
    const src = this.app.renderer.extract.canvas({
      target: this.app.stage,
      frame,
      resolution: 1,
    }) as HTMLCanvasElement
    ctx.fillStyle = this.backgroundCss
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(src, 0, 0, w, h)
  }
}
