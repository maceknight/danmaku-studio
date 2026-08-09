import { useMemo, useState } from 'react'
import {
  compileToCsv,
  compileToDanmakufu,
  exportCsv,
  exportJson,
  exportPh3,
  serializeProject,
} from '../io/projectIo'
import { useStore, type ExportTab } from '../store/useStore'
import { GifExport } from './GifExport'
import { Btn, Card, Field, Select } from './widgets'

const TABS: { id: ExportTab; label: string }[] = [
  { id: 'script', label: 'スクリプト' },
  { id: 'json', label: 'JSON' },
  { id: 'csv', label: 'CSV' },
  { id: 'gif', label: 'GIF' },
]

export function ExportPanel() {
  const project = useStore((s) => s.project)
  const revision = useStore((s) => s.revision)
  const tab = useStore((s) => s.exportTab)
  const setExportTab = useStore((s) => s.setExportTab)
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(false)

  const text = useMemo(() => {
    void revision
    if (tab === 'gif') return ''
    if (tab === 'script') return compileToDanmakufu(project)
    if (tab === 'json') return serializeProject(project)
    return compileToCsv(project)
  }, [project, revision, tab])

  const lines = text.split('\n').length

  // The body scrolls: on a phone the GIF form is taller than the panel, and the
  // export button would otherwise sit below the fold with no way to reach it.
  return (
    <Card index={5} title="出力 / エクスポート" bodyClassName="flex flex-col overflow-y-auto">
      <div className="flex shrink-0 gap-1 px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setExportTab(t.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] transition-colors ${
              tab === t.id
                ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-ink)]'
                : 'text-[var(--text-2)] hover:bg-[var(--hover)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'gif' && <GifExport />}

      {tab !== 'gif' && (
      <div className="space-y-2 px-3 py-2.5">
        <Field label="出力形式">
          <Select
            value={tab}
            options={[
              { value: 'script', label: '東方弾幕風 ph3 (.txt)' },
              { value: 'json', label: 'プロジェクト JSON (.dmk)' },
              { value: 'csv', label: 'パターン一覧 (.csv)' },
              { value: 'gif', label: 'アニメーション GIF (.gif)' },
            ]}
            onChange={(v) => setExportTab(v as ExportTab)}
          />
        </Field>

        <div className="flex gap-1.5">
          <Btn
            className="flex-1"
            onClick={() => {
              void navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            {copied ? 'コピーしました' : 'コピー'}
          </Btn>
          <Btn
            tone="primary"
            className="flex-1"
            onClick={() => {
              if (tab === 'script') exportPh3(project)
              else if (tab === 'json') exportJson(project)
              else exportCsv(project)
            }}
          >
            ファイルに保存
          </Btn>
        </div>

        <button
          onClick={() => setPreview(!preview)}
          className="w-full text-left text-[11px] text-[var(--muted)] hover:text-[var(--text-2)]"
        >
          {preview ? '▾' : '▸'} 出力プレビュー（{lines} 行）
        </button>
      </div>
      )}

      {preview && tab !== 'gif' && (
        <pre className="mx-3 mb-3 max-h-[260px] min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card-2)] p-2.5 font-mono text-[10.5px] leading-[1.55] whitespace-pre text-[var(--text-2)]">
          {text}
        </pre>
      )}
    </Card>
  )
}
