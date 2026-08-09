import { useEffect, useRef } from 'react'
import type { BulletShape, PatternType } from '../types/dmk'
import { SHAPES, traceShape } from '../types/shapes'

const S = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const Icon = {
  logo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="4" r="2" />
      <circle cx="12" cy="20" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="20" cy="12" r="2" />
      <circle cx="6.3" cy="6.3" r="1.5" />
      <circle cx="17.7" cy="17.7" r="1.5" />
      <circle cx="17.7" cy="6.3" r="1.5" />
      <circle cx="6.3" cy="17.7" r="1.5" />
    </svg>
  ),
  open: () => (
    <S>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </S>
  ),
  save: () => (
    <S>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </S>
  ),
  undo: () => (
    <S>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
    </S>
  ),
  redo: () => (
    <S>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3L21 13" />
    </S>
  ),
  play: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  ),
  pause: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4.5" width="4.5" height="15" rx="1" />
      <rect x="13.5" y="4.5" width="4.5" height="15" rx="1" />
    </svg>
  ),
  step: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 4.5v15l11-7.5z" />
      <rect x="17" y="4.5" width="3" height="15" rx="1" />
    </svg>
  ),
  stepBack: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 4.5v15L8 12z" />
      <rect x="4" y="4.5" width="3" height="15" rx="1" />
    </svg>
  ),
  toStart: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4.5" width="3" height="15" rx="1" />
      <path d="M20 4.5v15L9 12z" />
    </svg>
  ),
  camera: () => (
    <S>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </S>
  ),
  gear: () => (
    <S>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-3-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 3 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
    </S>
  ),
  sun: () => (
    <S>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </S>
  ),
  moon: () => (
    <S>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </S>
  ),
  hand: () => (
    <S>
      <path d="M18 11V6.5a1.5 1.5 0 0 0-3 0V11M15 11V4.5a1.5 1.5 0 0 0-3 0V11M12 11V5.5a1.5 1.5 0 0 0-3 0v8" />
      <path d="M9 13.5 7.5 12a1.6 1.6 0 0 0-2.3 2.3l3.6 4.4a5 5 0 0 0 3.9 1.8h1.8a4 4 0 0 0 4-4V11" />
    </S>
  ),
  cursor: () => (
    <S>
      <path d="M4 3l7 17 2.2-6.8L20 11z" />
    </S>
  ),
  move: () => (
    <S>
      <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
    </S>
  ),
  zoomIn: () => (
    <S>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5M11 8v6M8 11h6" />
    </S>
  ),
  zoomOut: () => (
    <S>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5M8 11h6" />
    </S>
  ),
  fit: () => (
    <S>
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </S>
  ),
  plus: () => (
    <S>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  copy: () => (
    <S>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </S>
  ),
  paste: () => (
    <S>
      <path d="M8 4H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <rect x="12" y="10" width="9" height="10" rx="2" />
    </S>
  ),
  trash: () => (
    <S>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </S>
  ),
  folder: () => (
    <S size={14}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </S>
  ),
  folderPlus: () => (
    <S>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </S>
  ),
  eye: (open = true) =>
    open ? (
      <S size={13}>
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="2.6" />
      </S>
    ) : (
      <S size={13}>
        <path d="M4 4l16 16" />
        <path d="M9.9 5.8A10.6 10.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.3 4M6.3 8A17 17 0 0 0 2 12s3.6 6.5 10 6.5a10.7 10.7 0 0 0 3.7-.6" />
      </S>
    ),
  arrowUp: () => (
    <S>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </S>
  ),
  arrowDown: () => (
    <S>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </S>
  ),
  search: () => (
    <S size={14}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </S>
  ),
  filter: () => (
    <S size={14}>
      <path d="M3 5h18l-7 8v5l-4 2v-7z" />
    </S>
  ),
  chevron: () => (
    <S size={12}>
      <path d="M9 6l6 6-6 6" />
    </S>
  ),
  check: () => (
    <S size={13}>
      <path d="M4 12.5l5 5L20 6.5" />
    </S>
  ),
  select: () => (
    <S size={14}>
      <path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M20 4v4M4 16v4M20 16v4" />
    </S>
  ),
}

// ---------------------------------------------------------------------------
// Pattern library thumbnails — a dot arrangement per pattern type.
// ---------------------------------------------------------------------------

function dots(type: PatternType): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  const push = (a: number, d: number, r = 1.7) =>
    out.push({
      x: 24 + Math.cos((a * Math.PI) / 180) * d,
      y: 24 + Math.sin((a * Math.PI) / 180) * d,
      r,
    })

  switch (type) {
    case 'circle':
      for (let i = 0; i < 16; i++) push(i * 22.5, 16)
      break
    case 'ring':
      for (let i = 0; i < 20; i++) push(i * 18, 17, 1.4)
      for (let i = 0; i < 10; i++) push(i * 36 + 18, 9, 1.2)
      break
    case 'spiral':
      for (let i = 0; i < 34; i++) push(i * 28, 3 + i * 0.52, 1.3)
      break
    case 'flower':
      for (let p = 0; p < 6; p++)
        for (let i = 0; i < 6; i++) push(p * 60 + i * 5 - 12, 5 + i * 2.4, 1.25)
      break
    case 'nway':
      for (let i = 0; i < 7; i++) {
        const a = 90 - 45 + i * 15
        for (let d = 1; d <= 3; d++) push(a, d * 6, 1.4)
      }
      break
    case 'fan':
      for (let i = 0; i < 9; i++) push(-90 - 60 + i * 15, 17, 1.7)
      for (let i = 0; i < 9; i++) push(-90 - 60 + i * 15, 10, 1.3)
      break
    case 'wave':
      for (let i = 0; i < 26; i++) {
        const x = 5 + i * 1.4
        out.push({ x, y: 24 + Math.sin(i * 0.55) * 11, r: 1.4 })
      }
      break
    case 'cross':
      for (let i = 1; i <= 8; i++) {
        push(0, i * 2.3, 1.4)
        push(90, i * 2.3, 1.4)
        push(180, i * 2.3, 1.4)
        push(270, i * 2.3, 1.4)
      }
      break
    case 'random':
      for (let i = 0; i < 26; i++) {
        const a = (i * 137.5) % 360
        push(a, 4 + ((i * 7) % 15), 1.4)
      }
      break
    case 'burst':
      for (let a = 0; a < 360; a += 30)
        for (let d = 4; d <= 18; d += 4.5) push(a, d, d > 12 ? 1.6 : 1.2)
      break
    case 'laser':
      for (let i = 0; i < 12; i++) out.push({ x: 24, y: 8 + i * 2.6, r: 1.5 })
      break
    case 'aim':
      for (let i = 0; i < 3; i++)
        for (let d = 1; d <= 4; d++) push(90 + (i - 1) * 11, 3 + d * 3.6, 1.4)
      break
  }
  return out
}

/**
 * Bullet silhouette preview. Shares `traceShape` with the renderer so the
 * picker always matches what the stage draws.
 */
export function ShapeGlyph({ shape, size = 18 }: { shape: BulletShape; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const spec = SHAPES[shape]
    const w = size
    const h = size / Math.max(1, spec.aspect)
    c.width = w * dpr
    c.height = size * dpr
    c.style.width = `${w}px`
    c.style.height = `${size}px`
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    const color = getComputedStyle(c).color || '#7c5cff'

    const cx = w / 2
    const cy = size / 2
    const rx = (w / 2) * 0.92
    const ry = (h / 2) * 0.92
    ctx.fillStyle = color
    traceShape(ctx, shape, cx, cy, rx, ry)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    traceShape(ctx, shape, cx, cy, rx * spec.coreRatio, ry * spec.coreRatio)
    ctx.fill()
  }, [shape, size])

  return <canvas ref={ref} aria-hidden />
}

export function PatternGlyph({ type, size = 44 }: { type: PatternType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      {dots(type).map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="currentColor" />
      ))}
    </svg>
  )
}
