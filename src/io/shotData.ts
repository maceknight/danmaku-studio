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
 */
export function parseShotConstants(source: string): Map<number, string> {
  const out = new Map<number, string>()
  const re = /let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripComments(source)))) {
    const id = Number(m[2])
    if (!out.has(id)) out.set(id, m[1])
  }
  return out
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
): Promise<{ sheet: ShotSheet; image: HTMLImageElement }> {
  const defText = await fetch(definitionUrl).then((r) => {
    if (!r.ok) throw new Error(`定義ファイルを読めません: ${definitionUrl}`)
    return r.text()
  })
  const sheet = parseUserShotData(defText)
  if (constantsUrl) {
    const constText = await fetch(constantsUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '')
    if (constText) applyNames(sheet, parseShotConstants(constText))
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
  return { sheet, image }
}

/** The drawable rect for a shot: static rect, or the first animation frame. */
export function shotRect(shot: ShotDef): Rect | null {
  return shot.rect ?? shot.animation[0]?.rect ?? null
}

export function rectSize(r: Rect): { w: number; h: number } {
  return { w: Math.abs(r.right - r.left), h: Math.abs(r.bottom - r.top) }
}
