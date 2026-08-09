import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Numbered card, the base container of every panel. */
export function Card({
  index,
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  index?: number
  title: string
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`card flex min-h-0 flex-col ${className}`}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        {index !== undefined && (
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent-ink)]">
            {index}
          </span>
        )}
        <h2 className="text-[12.5px] font-semibold text-[var(--text)]">{title}</h2>
        <div className="ml-auto flex items-center gap-1.5">{right}</div>
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** Collapsible property group, e.g. 「基本設定」. */
export function Group({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left hover:bg-[var(--hover)]"
      >
        <span className={`text-[10px] text-[var(--muted)] transition-transform ${open ? 'rotate-90' : ''}`}>
          ▶
        </span>
        {icon}
        <span className="flex-1 text-[12px] font-semibold text-[var(--accent-ink)]">{title}</span>
      </button>
      {open && <div className="space-y-1.5 px-3 pb-3">{children}</div>}
    </div>
  )
}

/** Label on the left, control on the right — the Inspector row rhythm. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[92px] shrink-0 truncate text-[11.5px] text-[var(--text-2)]">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  )
}

export function NumField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  precision = 2,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  precision?: number
}) {
  const [text, setText] = useState(() => fmt(value, precision))
  const editing = useRef(false)
  const drag = useRef<{ x: number; start: number } | null>(null)

  useEffect(() => {
    if (!editing.current) setText(fmt(value, precision))
  }, [value, precision])

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => {
          editing.current = true
          setText(e.target.value)
        }}
        onBlur={(e) => {
          editing.current = false
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(clamp(v, min, max))
          else setText(fmt(value, precision))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(clamp(value + step, min, max))
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(clamp(value - step, min, max))
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !e.altKey) return
          drag.current = { x: e.clientX, start: value }
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          onChange(clamp(drag.current.start + (e.clientX - drag.current.x) * step, min, max))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        title="Alt+ドラッグでスクラブ"
        className={suffix ? 'pr-7' : ''}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-[var(--muted)]">
          {suffix}
        </span>
      )}
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[11.5px] text-[var(--text-2)] hover:bg-[var(--hover)]"
    >
      <span
        className={`flex h-[14px] w-[14px] items-center justify-center rounded-[4px] border text-[9px] leading-none text-white ${
          checked
            ? 'border-[var(--accent)] bg-[var(--accent)]'
            : 'border-[var(--border-strong)] bg-transparent'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11.5px] text-[var(--text-2)] hover:bg-[var(--hover)]"
    >
      {label}
      <span
        className={`relative h-[16px] w-[30px] rounded-full transition-colors ${
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all ${
            checked ? 'left-[16px]' : 'left-[2px]'
          }`}
        />
      </span>
    </button>
  )
}

export function Btn({
  children,
  onClick,
  active,
  title,
  tone = 'default',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  title?: string
  tone?: 'default' | 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  className?: string
}) {
  const tones: Record<string, string> = {
    default:
      'border border-[var(--border)] bg-[var(--card)] text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]',
    primary: 'border border-transparent bg-[var(--accent)] text-white hover:brightness-110',
    ghost: 'border border-transparent text-[var(--text-2)] hover:bg-[var(--hover)]',
    danger:
      'border border-[var(--border)] bg-[var(--card)] text-[#e05260] hover:bg-[#fdeced] dark:hover:bg-[#3a1d25]',
  }
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-[11.5px] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? 'border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]'
          : tones[tone]
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Square icon button used by the top bar and the preview tool palette. */
export function IconBtn({
  children,
  onClick,
  title,
  active,
  disabled,
  size = 30,
}: {
  children: ReactNode
  onClick?: () => void
  title: string
  active?: boolean
  disabled?: boolean
  size?: number
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined && v < min) return min
  if (max !== undefined && v > max) return max
  return v
}

function fmt(v: number, precision: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '')
}
