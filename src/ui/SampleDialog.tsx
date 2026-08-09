import { useState } from 'react'
import { LESSONS, REFERENCES, type Sample } from '../samples'
import { useStore } from '../store/useStore'
import { FPS } from '../types/dmk'
import { Btn } from './widgets'

/**
 * Sample picker, ordered as a course. Loading goes through `loadProject`,
 * which pushes the current project onto the undo stack — Ctrl+Z gets it back.
 */
export function SampleDialog() {
  const open = useStore((s) => s.showSamples)
  const [openId, setOpenId] = useState<string | null>(null)
  const s = useStore.getState
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-6"
      onClick={() => s().setShowSamples(false)}
    >
      <div
        className="card flex max-h-full w-full max-w-[680px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
          <h2 className="text-[13px] font-semibold">サンプル講座</h2>
          <span className="text-[11px] text-[var(--muted)]">
            上から順に1つずつ要素が増えます
          </span>
          <button
            className="ml-auto text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => s().setShowSamples(false)}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {LESSONS.map((sample) => (
            <Row
              key={sample.id}
              sample={sample}
              expanded={openId === sample.id}
              onToggle={() => setOpenId(openId === sample.id ? null : sample.id)}
            />
          ))}

          <div className="pt-3 pb-1 text-[11px] font-semibold text-[var(--muted)]">
            リファレンス
          </div>
          {REFERENCES.map((sample) => (
            <Row
              key={sample.id}
              sample={sample}
              expanded={openId === sample.id}
              onToggle={() => setOpenId(openId === sample.id ? null : sample.id)}
            />
          ))}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] p-3">
          <p className="flex-1 text-[10.5px] text-[var(--muted)]">
            読み込むと今のプロジェクトは置き換わります（Ctrl+Z で戻せます）
          </p>
          <Btn onClick={() => s().setShowSamples(false)}>閉じる</Btn>
        </footer>
      </div>
    </div>
  )
}

function Row({
  sample,
  expanded,
  onToggle,
}: {
  sample: Sample
  expanded: boolean
  onToggle: () => void
}) {
  const s = useStore.getState
  const preview = sample.build()
  const patterns = preview.emitters.reduce((n, e) => n + e.patterns.length, 0)

  return (
    <div
      className={`rounded-xl border transition-colors ${
        expanded ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'
      }`}
    >
      <div className="flex items-start gap-2 p-3">
        {sample.lesson !== undefined && (
          <span className="mt-[1px] flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[10px] font-bold text-white">
            {sample.lesson}
          </span>
        )}
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[12.5px] font-semibold text-[var(--text)]">
              {sample.name}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--muted)]">
              {preview.emitters.length}E / {patterns}P / {preview.settings.duration / FPS}s
            </span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--text-2)]">
            {sample.description}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {sample.tags.map((t) => (
              <span
                key={t}
                className="rounded-md bg-[var(--card-2)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
              >
                {t}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-[var(--muted)]">
              {expanded ? '▾ 解説' : '▸ 解説'}
            </span>
          </div>
        </button>
        <Btn
          tone="primary"
          onClick={() => {
            s().loadProject(sample.build())
            s().setShowSamples(false)
          }}
        >
          開く
        </Btn>
      </div>

      {expanded && (
        <p className="border-t border-[var(--border)] px-3 py-2.5 text-[11.5px] leading-[1.75] text-[var(--text-2)]">
          {sample.tip}
        </p>
      )}
    </div>
  )
}
