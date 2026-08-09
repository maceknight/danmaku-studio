import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { PatternType } from '../types/dmk'
import { PATTERN_CATEGORY, PATTERN_LABELS, PATTERN_LIBRARY } from '../types/factory'
import { PatternGlyph } from './icons'
import { Card } from './widgets'

export const LIBRARY_DRAG_TYPE = 'application/x-danmaku-pattern'

const CATEGORIES = ['すべて', '基本', '東方風', 'CAVE風', 'その他'] as const

/**
 * Click adds the pattern to the selected emitter at the playhead; dragging it
 * onto a timeline group drops it at the frame under the cursor.
 */
export function PatternLibrary() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('すべて')
  const selection = useStore((s) => s.selection)
  const emitters = useStore((s) => s.project.emitters)
  const frame = useStore((s) => s.frame)
  const addPattern = useStore((s) => s.addPattern)

  const targetEmitterId =
    selection?.type === 'emitter' || selection?.type === 'pattern'
      ? selection.emitterId
      : emitters[0]?.id

  const items = PATTERN_LIBRARY.filter(
    (t) => category === 'すべて' || PATTERN_CATEGORY[t] === category,
  )

  return (
    <Card title="パターンライブラリ" bodyClassName="flex flex-col">
      <div className="flex shrink-0 flex-wrap gap-1 px-3 py-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
              category === c
                ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]'
                : 'text-[var(--text-2)] hover:bg-[var(--hover)]'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="grid grid-cols-4 gap-2">
          {items.map((type) => (
            <button
              key={type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(LIBRARY_DRAG_TYPE, type)
                e.dataTransfer.setData('text/plain', type)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => targetEmitterId && addPattern(targetEmitterId, type, frame)}
              disabled={!targetEmitterId}
              title={`${PATTERN_LABELS[type]} — クリックで追加 / タイムラインへドラッグ`}
              className="flex flex-col items-center gap-1 rounded-xl border border-[var(--border)] px-1 py-2 text-[var(--accent)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
            >
              <PatternGlyph type={type} size={42} />
              <span className="text-[10.5px] text-[var(--text-2)]">{PATTERN_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="shrink-0 px-3 py-2.5 text-center text-[11px] text-[var(--muted)]">
        ドラッグ＆ドロップで追加
      </p>
    </Card>
  )
}

export type { PatternType }
