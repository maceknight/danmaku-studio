import { useStore } from '../store/useStore'
import { FPS } from '../types/dmk'
import { Btn, Field, NumField, Select } from './widgets'

/** Project + editor preferences. Theme lives here as well as in the top bar. */
export function SettingsDialog() {
  const open = useStore((s) => s.showSettings)
  const project = useStore((s) => s.project)
  const theme = useStore((s) => s.theme)
  const timeUnit = useStore((s) => s.timeUnit)
  const s = useStore.getState
  if (!open) return null
  const st = project.settings

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-8"
      onClick={() => s().setShowSettings(false)}
    >
      <div
        className="card flex max-h-full w-full max-w-[440px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-4">
          <h2 className="text-[13px] font-semibold">設定</h2>
          <button
            className="ml-auto text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => s().setShowSettings(false)}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold text-[var(--accent-ink)]">表示</h3>
            <Field label="テーマ">
              <Select
                value={theme}
                options={[
                  { value: 'light', label: 'ライト' },
                  { value: 'dark', label: 'ダーク' },
                ]}
                onChange={(v) => s().setTheme(v)}
              />
            </Field>
            <Field label="時間表示">
              <Select
                value={timeUnit}
                options={[
                  { value: 'second', label: '秒' },
                  { value: 'frame', label: 'フレーム' },
                ]}
                onChange={(v) => s().setTimeUnit(v)}
              />
            </Field>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold text-[var(--accent-ink)]">プロジェクト</h3>
            <Field label="名前">
              <input
                type="text"
                value={project.name}
                onChange={(e) => s().mutate((p) => void (p.name = e.target.value))}
              />
            </Field>
            <Field label="全体の長さ">
              <NumField
                value={st.duration / FPS}
                step={1}
                min={1}
                suffix="s"
                onChange={(v) => s().mutate((p) => void (p.settings.duration = Math.round(v * FPS)))}
              />
            </Field>
            <Field label="乱数シード">
              <NumField
                value={st.seed}
                onChange={(v) => s().mutate((p) => void (p.settings.seed = Math.round(v)))}
              />
            </Field>
            <Field label="ステージ幅">
              <NumField
                value={st.stageWidth}
                min={64}
                onChange={(v) => s().mutate((p) => void (p.settings.stageWidth = Math.round(v)))}
              />
            </Field>
            <Field label="ステージ高">
              <NumField
                value={st.stageHeight}
                min={64}
                onChange={(v) => s().mutate((p) => void (p.settings.stageHeight = Math.round(v)))}
              />
            </Field>
            <Field label="自機 X">
              <NumField
                value={st.playerX}
                onChange={(v) => s().mutate((p) => void (p.settings.playerX = v))}
              />
            </Field>
            <Field label="自機 Y">
              <NumField
                value={st.playerY}
                onChange={(v) => s().mutate((p) => void (p.settings.playerY = v))}
              />
            </Field>
          </section>

          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold text-[var(--accent-ink)]">ボス (出力用)</h3>
            <Field label="名前">
              <input
                type="text"
                value={st.bossName}
                onChange={(e) => s().mutate((p) => void (p.settings.bossName = e.target.value))}
              />
            </Field>
            <Field label="体力">
              <NumField
                value={st.bossLife}
                step={100}
                onChange={(v) => s().mutate((p) => void (p.settings.bossLife = Math.round(v)))}
              />
            </Field>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-[11px] font-semibold text-[var(--accent-ink)]">ショートカット</h3>
            <ul className="space-y-1 text-[11px] text-[var(--text-2)]">
              <li>Space — 再生 / 停止</li>
              <li>← / → — 1フレーム送り（Shiftで10）</li>
              <li>Home / End — 先頭 / 末尾</li>
              <li>Ctrl+Z / Ctrl+Shift+Z — 元に戻す / やり直す</li>
              <li>Ctrl+D — 複製　Delete — 削除</li>
              <li>Alt+ドラッグ（数値欄）— 値スクラブ</li>
            </ul>
          </section>
        </div>

        <footer className="flex shrink-0 justify-between gap-2 border-t border-[var(--border)] p-3">
          <Btn
            tone="danger"
            onClick={() => {
              if (confirm('現在のプロジェクトを破棄して新規作成しますか？')) {
                s().newProject()
                s().setShowSettings(false)
              }
            }}
          >
            新規プロジェクト
          </Btn>
          <Btn tone="primary" onClick={() => s().setShowSettings(false)}>
            閉じる
          </Btn>
        </footer>
      </div>
    </div>
  )
}
