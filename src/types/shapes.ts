import type { BulletShape } from './dmk'

export interface ShapeSpec {
  label: string
  /** rough hit/visual radius in world units at scale 1 */
  radius: number
  /** aspect ratio (width / height) of the silhouette */
  aspect: number
  /** rotate the sprite to the travel direction */
  directional: boolean
  /** white core as a fraction of the outer silhouette; 0 = no core */
  coreRatio: number
  /**
   * Suffix appended to the colour name to build a ShotDataID, e.g. RED01.
   *
   * The numbering follows the layout most Default_ShotConst.txt files use, but
   * it is NOT guaranteed — shot data is per-project in ph3. Treat it as a
   * starting point and check against your own definition file; the ShotDataID
   * field stays editable for exactly this reason.
   */
  idSuffix: string
}

export const SHAPES: Record<BulletShape, ShapeSpec> = {
  ball: { label: '小弾', radius: 5.2, aspect: 1, directional: false, coreRatio: 0.52, idSuffix: '01' },
  ring: { label: '中弾', radius: 7.5, aspect: 1, directional: false, coreRatio: 0.62, idSuffix: '02' },
  scale: { label: '鱗弾', radius: 6.5, aspect: 1.5, directional: true, coreRatio: 0.5, idSuffix: '03' },
  rice: { label: '米弾', radius: 5, aspect: 2.1, directional: true, coreRatio: 0.5, idSuffix: '04' },
  ofuda: { label: '札', radius: 7, aspect: 1.9, directional: true, coreRatio: 0.55, idSuffix: '05' },
  ballLarge: {
    label: '大弾',
    radius: 11,
    aspect: 1,
    directional: false,
    coreRatio: 0.5,
    idSuffix: '11',
  },
  orb: { label: '光玉', radius: 9, aspect: 1, directional: false, coreRatio: 0.66, idSuffix: '12' },
  ellipse: {
    label: '楕円弾',
    radius: 6.5,
    aspect: 1.7,
    directional: true,
    coreRatio: 0.55,
    idSuffix: '13',
  },
  star: { label: '星弾', radius: 8, aspect: 1, directional: false, coreRatio: 0.45, idSuffix: '21' },
  butterfly: {
    label: '蝶弾',
    radius: 8,
    aspect: 1.3,
    directional: true,
    coreRatio: 0.4,
    idSuffix: '31',
  },
  knife: { label: 'ナイフ', radius: 7, aspect: 2.6, directional: true, coreRatio: 0.42, idSuffix: '41' },
}

export const SHAPE_ORDER: BulletShape[] = [
  'ball',
  'ring',
  'ballLarge',
  'orb',
  'scale',
  'rice',
  'ofuda',
  'ellipse',
  'star',
  'butterfly',
  'knife',
]

/** Suggested ph3 constant for a colour + shape pair, e.g. ("RED", 'rice') → RED04. */
export function suggestShotDataId(colorName: string, shape: BulletShape): string {
  return `${colorName}${SHAPES[shape].idSuffix}`
}

/**
 * Draws a silhouette into a 2D context, filling the given box. Shapes point
 * right (+X) so a directional sprite can simply be rotated by the travel angle.
 */
export function traceShape(
  ctx: CanvasRenderingContext2D,
  shape: BulletShape,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  ctx.beginPath()
  switch (shape) {
    case 'ball':
    case 'ring':
    case 'ballLarge':
    case 'orb':
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      break

    case 'ellipse':
    case 'rice':
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
      break

    case 'scale': {
      // kite: sharp nose, wide shoulders, tapered tail
      ctx.moveTo(cx + rx, cy)
      ctx.quadraticCurveTo(cx + rx * 0.1, cy - ry, cx - rx * 0.55, cy - ry * 0.62)
      ctx.quadraticCurveTo(cx - rx, cy, cx - rx * 0.55, cy + ry * 0.62)
      ctx.quadraticCurveTo(cx + rx * 0.1, cy + ry, cx + rx, cy)
      break
    }

    case 'ofuda': {
      const r = Math.min(rx, ry) * 0.35
      roundRect(ctx, cx - rx, cy - ry, rx * 2, ry * 2, r)
      break
    }

    case 'knife': {
      ctx.moveTo(cx + rx, cy)
      ctx.lineTo(cx - rx * 0.35, cy - ry)
      ctx.lineTo(cx - rx, cy - ry * 0.35)
      ctx.lineTo(cx - rx, cy + ry * 0.35)
      ctx.lineTo(cx - rx * 0.35, cy + ry)
      ctx.closePath()
      break
    }

    case 'star': {
      const points = 5
      for (let i = 0; i < points * 2; i++) {
        const a = (Math.PI / points) * i - Math.PI / 2
        const r = i % 2 === 0 ? 1 : 0.46
        const x = cx + Math.cos(a) * rx * r
        const y = cy + Math.sin(a) * ry * r
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    }

    case 'butterfly': {
      // two mirrored wings meeting at the body
      ctx.moveTo(cx, cy)
      ctx.bezierCurveTo(cx + rx * 0.2, cy - ry * 1.15, cx + rx, cy - ry * 0.9, cx + rx * 0.9, cy - ry * 0.1)
      ctx.bezierCurveTo(cx + rx * 0.85, cy + ry * 0.7, cx + rx * 0.25, cy + ry * 0.95, cx, cy)
      ctx.bezierCurveTo(cx - rx * 0.25, cy + ry * 0.95, cx - rx * 0.85, cy + ry * 0.7, cx - rx * 0.9, cy - ry * 0.1)
      ctx.bezierCurveTo(cx - rx, cy - ry * 0.9, cx - rx * 0.2, cy - ry * 1.15, cx, cy)
      ctx.closePath()
      break
    }
  }
  ctx.closePath()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
}
