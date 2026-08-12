/**
 * Parser for 弾幕風 ph3 `#UserShotData` definitions.
 *
 * Reading the real definition is what makes the preview trustworthy: the editor
 * draws the same sprite rect that ph3 will draw, so a ShotDataID is no longer a
 * guess. Pure text in, plain data out — no DOM, no rendering.
 */

export type RenderMode = 'ALPHA' | 'ADD' | 'ADD_ARGB' | 'ADD_RGB' | 'MULTIPLY' | 'SUBTRACT' | 'INV_DESTRXY'

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface AnimationFrame {
  /** frames this cell is shown for */
  duration: number
  rect: Rect
}

export interface ShotDef {
  id: number
  /** absent when the shot is animated — use `animation[0].rect` instead */
  rect: Rect | null
  delayRect: Rect | null
  render: RenderMode
  delayRender: RenderMode
  /** degrees per frame the sprite spins on its own */
  angularVelocity: number
  /** hit radius override */
  collision: number | null
  /** true = the sprite ignores the travel direction */
  fixedAngle: boolean
  animation: AnimationFrame[]
  /** name from the companion constants file, when one was supplied */
  name?: string
}

export interface ShotSheet {
  /** path as written in the definition, relative to the definition file */
  imagePath: string
  delayColor: [number, number, number] | null
  shots: Map<number, ShotDef>
  /** constant name → id, so a ShotDataID string can be resolved to a sprite */
  byName: Map<string, number>
}

/**
 * Resolve a project's ShotDataID text to a numeric shot id. Accepts either a
 * bare number ("42") or a constant name ("BGW_BALL_S_RED"). Returns 0 when the
 * sheet has nothing for it, which tells the renderer to fall back to its own
 * procedural silhouette.
 */
export function resolveShotId(sheet: ShotSheet | null, shotDataId: string): number {
  if (!sheet) return 0
  const text = shotDataId.trim()
  if (!text) return 0
  const asNumber = Number(text)
  if (Number.isFinite(asNumber) && sheet.shots.has(asNumber)) return asNumber
  return sheet.byName.get(text.toUpperCase()) ?? 0
}

const RENDER_ALIASES: Record<string, RenderMode> = {
  ALPHA: 'ALPHA',
  ADD: 'ADD_ARGB',
  ADD_ARGB: 'ADD_ARGB',
  ADD_RGB: 'ADD_RGB',
  MULTIPLY: 'MULTIPLY',
  SUBTRACT: 'SUBTRACT',
  INV_DESTRXY: 'INV_DESTRXY',
}

/** ph3 comments are `//` to end of line; there are no block comments. */
function stripComments(src: string): string {
  return src.replace(/\/\/[^\n]*/g, '')
}

function toRect(nums: number[]): Rect | null {
  if (nums.length < 4) return null
  return { left: nums[0], top: nums[1], right: nums[2], bottom: nums[3] }
}

function numbersIn(text: string): number[] {
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

/**
 * Splits the source into balanced `ShotData{ ... }` bodies. A regex can't do
 * this on its own because animated entries nest an `animation_data{ ... }`
 * block inside.
 */
function shotDataBlocks(src: string): string[] {
  const blocks: string[] = []
  const re = /ShotData\s*\{/g
  while (re.exec(src)) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    blocks.push(src.slice(re.lastIndex, i - 1))
    re.lastIndex = i
  }
  return blocks
}

export function parseUserShotData(source: string): ShotSheet {
  const src = stripComments(source)

  const imageMatch = src.match(/shot_image\s*=\s*"([^"]*)"/)
  const delayColorMatch = src.match(/delay_color\s*=\s*\(([^)]*)\)/)
  const delayColorNums = delayColorMatch ? numbersIn(delayColorMatch[1]) : []

  const shots = new Map<number, ShotDef>()

  for (const body of shotDataBlocks(src)) {
    const idMatch = body.match(/\bid\s*=\s*(\d+)/)
    if (!idMatch) continue
    const id = Number(idMatch[1])

    // Pull the animation block out first so its rects don't leak into the
    // top-level `rect` lookup. Note the block opener is `AnimationData{` while
    // the entries inside it are `animation_data = (...)`.
    const animMatch = body.match(/AnimationData\s*\{([\s\S]*?)\}/i)
    const animation: AnimationFrame[] = []
    if (animMatch) {
      const entryRe = /animation_data\s*=\s*\(([^)]*)\)/g
      let e: RegExpExecArray | null
      while ((e = entryRe.exec(animMatch[1]))) {
        const n = numbersIn(e[1])
        if (n.length >= 5) {
          const rect = toRect(n.slice(1, 5))
          if (rect) animation.push({ duration: Math.max(1, n[0]), rect })
        }
      }
    }
    const outer = animMatch ? body.replace(animMatch[0], '') : body

    const rectMatch = outer.match(/(?<!delay_)\brect\s*=\s*\(([^)]*)\)/)
    const delayRectMatch = outer.match(/delay_rect\s*=\s*\(([^)]*)\)/)
    const renderMatch = outer.match(/(?<!delay_)\brender\s*=\s*([A-Z_]+)/)
    const delayRenderMatch = outer.match(/delay_render\s*=\s*([A-Z_]+)/)
    const angularMatch = outer.match(/angular_velocity\s*=\s*(-?\d+(?:\.\d+)?)/)
    const collisionMatch = outer.match(/collision\s*=\s*(-?\d+(?:\.\d+)?)/)
    const fixedMatch = outer.match(/fixed_angle\s*=\s*(true|false)/i)

    shots.set(id, {
      id,
      rect: rectMatch ? toRect(numbersIn(rectMatch[1])) : null,
      delayRect: delayRectMatch ? toRect(numbersIn(delayRectMatch[1])) : null,
      render: RENDER_ALIASES[renderMatch?.[1] ?? 'ALPHA'] ?? 'ALPHA',
      delayRender: RENDER_ALIASES[delayRenderMatch?.[1] ?? 'ALPHA'] ?? 'ALPHA',
      angularVelocity: angularMatch ? Number(angularMatch[1]) : 0,
      collision: collisionMatch ? Number(collisionMatch[1]) : null,
      fixedAngle: fixedMatch ? fixedMatch[1].toLowerCase() === 'true' : false,
      animation,
    })
  }

  return {
    imagePath: imageMatch?.[1] ?? '',
    delayColor:
      delayColorNums.length >= 3
        ? [delayColorNums[0], delayColorNums[1], delayColorNums[2]]
        : null,
    shots,
    byName: new Map(),
  }
}

/**
 * Reads a companion constants file (`let NAME = 12;`) so shots can be shown by
 * name instead of by number.
 *
 * Scans line by line rather than stripping comments, because the comment that
 * introduces each group (`//　鱗弾`) is the only human-readable label the
 * family has — worth keeping for the picker.
 */
export function parseShotConstants(source: string): {
  names: Map<number, string>
  /** constant-name prefix → the comment that introduced it */
  labels: Map<string, string>
} {
  const names = new Map<number, string>()
  const labels = new Map<string, string>()
  const letRe = /^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*;/
  let pendingLabel = ''

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('//')) {
      const text = line.replace(/^\/+/, '').replace(/[\s　]+/g, ' ').trim()
      // section rules are just dashes; group headers carry an actual name
      if (text && !/^[-=]+$/.test(text)) pendingLabel = text
      continue
    }
    const m = line.match(letRe)
    if (!m) continue
    const [, name, idText] = m
    const id = Number(idText)
    if (!names.has(id)) names.set(id, name)
    const family = familyOf(name)
    if (family && pendingLabel && !labels.has(family)) labels.set(family, pendingLabel)
  }
  return { names, labels }
}

/** Colour suffixes shared by every family in a Danmakufu-style sheet. */
export const SHOT_COLORS = [
  'RED',
  'ORANGE',
  'YELLOW',
  'GREEN',
  'SKY',
  'BLUE',
  'PURPLE',
  'WHITE',
] as const

export type ShotColor = (typeof SHOT_COLORS)[number]

/** `BGW_BALL_S_RED` → `BGW_BALL_S`; returns '' when there is no colour suffix. */
export function familyOf(constantName: string): string {
  for (const c of SHOT_COLORS) {
    if (constantName.endsWith(`_${c}`)) return constantName.slice(0, -(c.length + 1))
  }
  return ''
}

export function colorOf(constantName: string): ShotColor | null {
  for (const c of SHOT_COLORS) {
    if (constantName.endsWith(`_${c}`)) return c
  }
  return null
}

export interface ShotFamily {
  /** constant prefix, e.g. BGW_BALL_S */
  key: string
  /** human label from the definition's comments, when there was one */
  label: string
  /** colour → shot id */
  colors: Map<ShotColor, number>
  /** id used for the thumbnail */
  sampleId: number
  /** true for the black-background variants (BGB_*) */
  blackBacked: boolean
}

/**
 * Collapse a 300-plus entry sheet into families × colours — roughly 30 icons
 * and 8 swatches instead of one enormous grid.
 */
export function shotFamilies(sheet: ShotSheet | null, labels?: Map<string, string>): ShotFamily[] {
  if (!sheet) return []
  const out = new Map<string, ShotFamily>()
  const ids = [...sheet.shots.keys()].sort((a, b) => a - b)

  for (const id of ids) {
    const name = sheet.shots.get(id)?.name
    if (!name) continue
    const key = familyOf(name)
    const color = colorOf(name)
    if (!key || !color) continue
    let fam = out.get(key)
    if (!fam) {
      fam = {
        key,
        label: labels?.get(key) ?? key,
        colors: new Map(),
        sampleId: id,
        blackBacked: key.startsWith('BGB'),
      }
      out.set(key, fam)
    }
    fam.colors.set(color, id)
  }
  return [...out.values()]
}

export function applyNames(sheet: ShotSheet, names: Map<number, string>) {
  for (const [id, name] of names) {
    const shot = sheet.shots.get(id)
    if (shot) {
      shot.name = name
      sheet.byName.set(name.toUpperCase(), id)
    }
  }
}

/**
 * Load a definition (+ optional constants) and its image.
 *
 * `imageUrl` overrides the path written in the definition. That path is
 * relative to wherever the file lives inside the ph3 script tree, which almost
 * never resolves once the file has been copied somewhere else.
 */
export async function loadShotSheet(
  definitionUrl: string,
  constantsUrl?: string,
  imageUrl?: string,
): Promise<{
  sheet: ShotSheet
  /** sanitised copy of the sheet — see sanitizeSheetImage */
  image: HTMLCanvasElement
  labels: Map<string, string>
  report: SanitizeReport
}> {
  const defText = await fetch(definitionUrl).then((r) => {
    if (!r.ok) throw new Error(`定義ファイルを読めません: ${definitionUrl}`)
    return r.text()
  })
  const sheet = parseUserShotData(defText)
  let labels = new Map<string, string>()
  if (constantsUrl) {
    const constText = await fetch(constantsUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
    if (constText) {
      const parsed = parseShotConstants(constText)
      applyNames(sheet, parsed.names)
      labels = parsed.labels
    }
  }

  // resolve the image relative to the definition file, as ph3 does
  const resolved =
    imageUrl ?? new URL(sheet.imagePath, new URL(definitionUrl, location.href)).href
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`画像を読めません: ${resolved}`))
    el.src = resolved
  })
  const { canvas, report } = sanitizeSheetImage(image, sheet)
  return { sheet, image: canvas, labels, report }
}

export interface SanitizeReport {
  clearedPixels: number
  affected: { id: number; name?: string; edge: 'top' | 'bottom'; rows: number }[]
}

/**
 * Strips glow that has leaked in from a neighbouring cell.
 *
 * The sheet is packed edge to edge, and some sprites' soft halos spill past
 * their cell into the one next door. Inside the wrong rect that reads as a
 * smudge along the bullet's edge — very visible on a dark stage.
 *
 * The test is physical rather than a guess: a sprite's own halo fades *away*
 * from its body, so any band that keeps getting brighter as it approaches the
 * cell boundary — and brighter still on the far side — belongs to the
 * neighbour. Only faint bands qualify, so real sprite edges are never touched.
 *
 * Non-destructive: the source PNG is untouched; this only fixes what the editor
 * draws. ph3 reads the same rects, so it will still show the leak until the
 * artwork itself is cleaned.
 */
export function sanitizeSheetImage(
  image: HTMLImageElement,
  sheet: ShotSheet,
): { canvas: HTMLCanvasElement; report: SanitizeReport } {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)

  const W = canvas.width
  const H = canvas.height
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  const report: SanitizeReport = { clearedPixels: 0, affected: [] }
  /** brighter than this is treated as real artwork, never stripped */
  const FAINT = 96

  const rowMax = (y: number, l: number, r: number) => {
    if (y < 0 || y >= H) return 0
    let m = 0
    for (let x = Math.max(0, l); x < Math.min(W, r); x++) {
      const a = d[(y * W + x) * 4 + 3]
      if (a > m) m = a
    }
    return m
  }
  const clearRow = (y: number, l: number, r: number) => {
    let n = 0
    for (let x = Math.max(0, l); x < Math.min(W, r); x++) {
      const o = (y * W + x) * 4
      if (d[o + 3] > 0) n++
      d[o] = 0
      d[o + 1] = 0
      d[o + 2] = 0
      d[o + 3] = 0
    }
    return n
  }

  for (const shot of sheet.shots.values()) {
    const r = shotRect(shot)
    if (!r) continue
    const l = Math.min(r.left, r.right)
    const t = Math.min(r.top, r.bottom)
    const rt = Math.max(r.left, r.right)
    const bt = Math.max(r.top, r.bottom)

    for (const edge of ['bottom', 'top'] as const) {
      const dir = edge === 'bottom' ? -1 : 1
      let y = edge === 'bottom' ? bt - 1 : t
      let ref = rowMax(edge === 'bottom' ? bt : t - 1, l, rt)
      if (ref === 0) continue
      let rows = 0
      while (y >= t && y <= bt - 1) {
        const cur = rowMax(y, l, rt)
        // stop at the first row that is bright, empty, or no longer fading
        // towards the boundary — that row is the sprite's own artwork
        if (cur === 0 || cur >= FAINT || cur >= ref) break
        report.clearedPixels += clearRow(y, l, rt)
        rows++
        ref = cur
        y += dir
      }
      if (rows > 0) report.affected.push({ id: shot.id, name: shot.name, edge, rows })
    }
  }

  ctx.putImageData(img, 0, 0)
  return { canvas, report }
}

/** The drawable rect for a shot: static rect, or the first animation frame. */
export function shotRect(shot: ShotDef): Rect | null {
  return shot.rect ?? shot.animation[0]?.rect ?? null
}

export function rectSize(r: Rect): { w: number; h: number } {
  return { w: Math.abs(r.right - r.left), h: Math.abs(r.bottom - r.top) }
}
