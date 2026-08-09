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
import type { SimSnapshotView } from '../engine/types'
import type { ProjectSettings } from '../types/dmk'

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
  /** coloured outer disc */
  private rimLayer = new Container()
  /** white inner core, drawn on top of every rim */
  private coreLayer = new Container()
  private hitboxLayer = new Graphics()
  private guideLayer = new Graphics()
  private markerLayer = new Container()
  private rimSprites: Sprite[] = []
  private coreSprites: Sprite[] = []
  private markers: { g: Graphics; label: Text }[] = []
  private discTexture: Texture | null = null
  private coreTexture: Texture | null = null
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
      resizeTo: host,
    })
    host.appendChild(this.app.canvas)
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
    this.discTexture = this.makeDiscTexture()
    this.coreTexture = this.makeCoreTexture()
    this.ready = true
  }

  destroy() {
    this.ready = false
    this.app.destroy(true, { children: true, texture: true })
  }

  get isReady() {
    return this.ready
  }

  /**
   * Bullets are drawn as two stacked discs — a tinted outer disc with a white
   * core on top, the classic Touhou shot look. Both layers share one sprite
   * pool each and a single texture, so each layer stays one draw batch.
   */
  private makeDiscTexture(): Texture {
    const size = 64
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')!
    const r = size / 2
    const g = ctx.createRadialGradient(r, r, 0, r, r, r)
    // solid to ~78% of the radius, then a short feathered edge for anti-aliasing
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.66, 'rgba(255,255,255,1)')
    g.addColorStop(0.82, 'rgba(255,255,255,0.92)')
    g.addColorStop(0.93, 'rgba(255,255,255,0.4)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return Texture.from(c)
  }

  private makeCoreTexture(): Texture {
    const size = 64
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')!
    const r = size / 2
    const g = ctx.createRadialGradient(r, r, 0, r, r, r)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.72, 'rgba(255,255,255,1)')
    g.addColorStop(0.9, 'rgba(255,255,255,0.85)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return Texture.from(c)
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

  layout(settings: ProjectSettings) {
    if (!this.ready) return
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

  /** Outer disc radius in world units for a bullet of scale 1. */
  private static readonly RIM_RADIUS = 5.2
  /** White core as a fraction of the outer disc. */
  private static readonly CORE_RATIO = 0.52

  private renderBullets(view: SimSnapshotView, opts: RenderOptions) {
    const bullets = view.bullets
    let si = 0
    this.laserLayer.clear()
    this.trailLayer.clear()
    this.hitboxLayer.clear()

    const rimScale = (StageRenderer.RIM_RADIUS * 2) / 64
    const coreScale = rimScale * StageRenderer.CORE_RATIO

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i]

      if (b.kind === 1) {
        const rad = (b.angle * Math.PI) / 180
        const ex = b.x + Math.cos(rad) * b.laserLength
        const ey = b.y + Math.sin(rad) * b.laserLength
        const w = b.laserWidth * b.scale
        // same idea as the shots: coloured body with a bright core down the middle
        this.laserLayer
          .moveTo(b.x, b.y)
          .lineTo(ex, ey)
          .stroke({ color: b.color, width: w, alpha: 0.5 * b.alpha, cap: 'round' })
        this.laserLayer
          .moveTo(b.x, b.y)
          .lineTo(ex, ey)
          .stroke({
            color: 0xffffff,
            width: w * StageRenderer.CORE_RATIO,
            alpha: 0.85 * b.alpha,
            cap: 'round',
          })
        if (opts.showHitbox) {
          this.hitboxLayer
            .moveTo(b.x, b.y)
            .lineTo(ex, ey)
            .stroke({ color: 0xff4d6a, width: 1, alpha: 0.5 })
        }
        continue
      }

      if (opts.showTrails && b.delay <= 0) {
        this.trailLayer
          .moveTo(b.px - (b.x - b.px) * 5, b.py - (b.y - b.py) * 5)
          .lineTo(b.x, b.y)
          .stroke({ color: b.color, width: 1.5 * b.scale, alpha: 0.18 * b.alpha })
      }

      let rim = this.rimSprites[si]
      let core = this.coreSprites[si]
      if (!rim) {
        rim = new Sprite(this.discTexture!)
        rim.anchor.set(0.5)
        this.rimLayer.addChild(rim)
        this.rimSprites[si] = rim
        core = new Sprite(this.coreTexture!)
        core.anchor.set(0.5)
        this.coreLayer.addChild(core)
        this.coreSprites[si] = core
      }

      const spawning = b.delay > 0
      const delayScale = spawning ? 1.7 + b.delay * 0.07 : 1
      const alpha = spawning ? 0.28 : b.alpha

      rim.visible = true
      rim.x = b.x
      rim.y = b.y
      rim.tint = b.color
      rim.scale.set(b.scale * rimScale * delayScale)
      rim.alpha = alpha
      rim.blendMode = b.additive ? 'add' : 'normal'

      core.visible = !spawning
      core.x = b.x
      core.y = b.y
      core.scale.set(b.scale * coreScale)
      core.alpha = b.alpha
      core.blendMode = b.additive ? 'add' : 'normal'

      si++

      if (opts.showHitbox && !spawning) {
        this.hitboxLayer.circle(b.x, b.y, b.hitbox * b.scale)
      }
    }

    if (opts.showHitbox) this.hitboxLayer.stroke({ color: 0xff4d6a, width: 1, alpha: 0.65 })
    for (let i = si; i < this.rimSprites.length; i++) {
      this.rimSprites[i].visible = false
      this.coreSprites[i].visible = false
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
