import { useEffect, useMemo, useRef, useState } from 'react'
import {
  colorOf,
  familyOf,
  resolveShotId,
  shotRect,
  SHOT_COLORS,
  type ShotColor,
  type ShotFamily,
} from '../io/shotData'
import { useStore } from '../store/useStore'

/** Draws one shot's sprite straight out of the sheet, scaled to fit `size`. */
export function ShotThumb({ shotId, size = 26 }: { shotId: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const sheet = useStore((s) => s.shotSheet)
  const image = useStore((s) => s.shotSheetImage)

  useEffect(() => {
    const canvas = ref.current
    const shot = sheet?.shots.get(shotId)
    if (!canvas || !shot || !image) return
    const r = shotRect(shot)
    if (!r) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, size, size)
    ctx.imageSmoothingEnabled = true

    const sx = Math.min(r.left, r.right)
    const sy = Math.min(r.top, r.bottom)
    const sw = Math.abs(r.right - r.left)
    const sh = Math.abs(r.bottom - r.top)
    if (sw <= 0 || sh <= 0) return
    // never blow a sprite up past its own size — keeps 8px shots looking 8px
    const scale = Math.min(size / sw, size / sh, 2)
    const dw = sw * scale
    const dh = sh * scale
    ctx.drawImage(image, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh)
  }, [shotId, size, sheet, image])

  return <canvas ref={ref} aria-hidden />
}

/**
 * Family × colour picker.
 *
 * A sheet has hundreds of entries, but its constant names encode
 * `<FAMILY>_<COLOUR>`, so ~30 shape icons plus 8 swatches covers all of them
 * without an unusable wall of thumbnails.
 */
export function ShotPicker({
  value,
  onChange,
}: {
  /** current ShotDataID text */
  value: string
  onChange: (shotDataId: string, shotId: number) => void
}) {
  const families = useStore((s) => s.shotFamilies)
  const [query, setQuery] = useState('')
  const [showBlack, setShowBlack] = useState(false)

  // The field may hold a bare numeric id; resolve it back to a constant name so
  // the picker can still highlight the right family.
  const sheet = useStore((s) => s.shotSheet)
  const currentName = useMemo(() => {
    if (familyOf(value)) return value
    const id = resolveShotId(sheet, value)
    return id ? (sheet?.shots.get(id)?.name ?? value) : value
  }, [value, sheet])

  const currentFamily = familyOf(currentName)
  const currentColor = colorOf(currentName) ?? 'RED'

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return families.filter((f) => {
      if (!showBlack && f.blackBacked && f.key !== currentFamily) return false
      if (!q) return true
      return f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
    })
  }, [families, query, showBlack, currentFamily])

  if (families.length === 0) return null

  const pick = (fam: ShotFamily, color: ShotColor) => {
    // families are meant to carry all eight colours, but fall back gracefully
    const chosen = fam.colors.has(color) ? color : [...fam.colors.keys()][0]
    if (!chosen) return
    onChange(`${fam.key}_${chosen}`, fam.colors.get(chosen)!)
  }

  const activeFamily = families.find((f) => f.key === currentFamily) ?? null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={query}
          placeholder={`弾を検索… (${families.length} 種類)`}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          title="黒背景の弾も表示（加算合成用に作られた素材）"
          onClick={() => setShowBlack(!showBlack)}
          className={`shrink-0 rounded-md border px-2 py-1 text-[10px] whitespace-nowrap ${
            showBlack
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--border)] text-[var(--muted)]'
          }`}
        >
          黒背景
        </button>
      </div>

      <div className="grid max-h-[210px] grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-1.5">
        {visible.map((fam) => {
          const id = fam.colors.get(currentColor) ?? fam.sampleId
          const selected = fam.key === currentFamily
          return (
            <button
              key={fam.key}
              title={`${fam.label}\n${fam.key}_${currentColor}`}
              onClick={() => pick(fam, currentColor)}
              className={`flex aspect-square items-center justify-center rounded-md border transition-colors ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-transparent hover:border-[var(--border-strong)] hover:bg-[var(--hover)]'
              } ${fam.blackBacked ? 'bg-[#15131c]' : ''}`}
            >
              <ShotThumb shotId={id} size={26} />
            </button>
          )
        })}
        {visible.length === 0 && (
          <p className="col-span-6 py-3 text-center text-[11px] text-[var(--muted)]">
            該当なし
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {SHOT_COLORS.map((c) => {
          const id = activeFamily?.colors.get(c)
          const disabled = !activeFamily || id === undefined
          return (
            <button
              key={c}
              title={c}
              disabled={disabled}
              onClick={() => activeFamily && pick(activeFamily, c)}
              className={`flex h-7 flex-1 items-center justify-center rounded-md border transition-colors disabled:opacity-30 ${
                currentColor === c
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] hover:bg-[var(--hover)]'
              }`}
            >
              {id !== undefined ? (
                <ShotThumb shotId={id} size={18} />
              ) : (
                <span className="text-[9px] text-[var(--muted)]">–</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-[10.5px] text-[var(--muted)]">
        {activeFamily ? (
          <>
            {activeFamily.label} ·{' '}
            <code className="text-[var(--text-2)]">{currentName}</code>
          </>
        ) : (
          <>
            <code className="text-[var(--text-2)]">{value}</code>{' '}
            はこのショットデータに無いので、内蔵シルエットで描画中
          </>
        )}
      </p>
    </div>
  )
}
