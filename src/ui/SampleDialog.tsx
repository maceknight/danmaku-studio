import { SAMPLES } from '../samples'
import { useStore } from '../store/useStore'
import { FPS } from '../types/dmk'
import { Btn } from './widgets'

/**
 * Sample picker. Loading goes through `loadProject`, which pushes the current
 * project onto the undo stack — so Ctrl+Z gets your work back.
 */
export function SampleDialog() {
  const open = useStore((s) => s.showSamples)
  const s = useStore.getState
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-8"
      onClick={() => s().setShowSamples(false)}
    >
      <div
        className="card flex max-h-full w-full max-w-[620px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-4">
          <h2 className="text-[13px] font-semibold">サンプルを開く</h2>
          <button
            className="ml-auto text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => s().setShowSamples(false)}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {SAMPLES.map((sample) => {
            const preview = sample.build()
            const patterns = preview.emitters.reduce((n, e) => n + e.patterns.length, 0)
            return (
              <button
                key={sample.id}
                onClick={() => {
                  s().loadProject(sample.build())
                  s().setShowSamples(false)
                }}
                className="w-full rounded-xl border border-[var(--border)] p-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-semibold text-[var(--text)]">
                    {sample.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[var(--muted)]">
                    {preview.emitters.length} エミッター / {patterns} パターン /{' '}
                    {preview.settings.duration / FPS}s
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
                </div>
              </button>
            )
          })}
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
