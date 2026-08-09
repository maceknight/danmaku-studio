import { useEffect, useRef, useState } from 'react'
import {
  DISCORD_LIMIT,
  encodeGif,
  estimateFrames,
  formatBytes,
  gifDelayMs,
  type GifOptions,
  type GifProgress,
} from '../io/gifExport'
import { downloadBlob } from '../io/projectIo'
import { useStore } from '../store/useStore'
import { FPS } from '../types/dmk'
import { recordGifFrames } from './Preview'
import { Btn, Field, NumField, Select } from './widgets'

const WIDTHS = [
  { value: '320', label: '320px (軽い)' },
  { value: '400', label: '400px (推奨)' },
  { value: '480', label: '480px' },
  { value: '600', label: '600px (重い)' },
]

const STEPS = [
  { value: '2', label: '30 fps (なめらか・重い)' },
  { value: '3', label: '20 fps (推奨)' },
  { value: '4', label: '15 fps' },
  { value: '6', label: '10 fps (軽い)' },
]

/** Discord-friendly animated GIF of the preview. */
export function GifExport() {
  const project = useStore((s) => s.project)
  const frame = useStore((s) => s.frame)
  const selection = useStore((s) => s.selection)
  const duration = project.settings.duration

  const [startSec, setStartSec] = useState(0)
  const [lengthSec, setLengthSec] = useState(4)
  const [width, setWidth] = useState(400)
  const [step, setStep] = useState(3)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<GifProgress | null>(null)
  const [result, setResult] = useState<{ url: string; size: number; frames: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const startFrame = Math.round(startSec * FPS)
  const endFrame = Math.min(duration, startFrame + Math.round(lengthSec * FPS))
  const opts: GifOptions = { startFrame, endFrame, frameStep: step, width, loop: true }
  const frameCount = estimateFrames(opts)
  const height = Math.round((width * project.settings.stageHeight) / project.settings.stageWidth)

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const captured = await recordGifFrames(opts, setProgress)
      if (!captured) throw new Error('プレビューが初期化されていません')
      const blob = await encodeGif(
        captured.frames,
        captured.width,
        captured.height,
        opts,
        setProgress,
      )
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, size: blob.size, frames: captured.frames.length })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const tooBig = result !== null && result.size > DISCORD_LIMIT

  return (
    <div className="space-y-2 px-3 py-2.5">
      <Field label="開始">
        <div className="flex items-center gap-1.5">
          <NumField
            value={startSec}
            step={0.5}
            min={0}
            max={duration / FPS}
            suffix="s"
            onChange={setStartSec}
          />
          <Btn title="再生ヘッドの位置を開始にする" onClick={() => setStartSec(frame / FPS)}>
            現在
          </Btn>
        </div>
      </Field>
      <Field label="長さ">
        <NumField value={lengthSec} step={0.5} min={0.2} max={20} suffix="s" onChange={setLengthSec} />
      </Field>
      {selection?.type === 'pattern' && (
        <Btn
          className="w-full"
          onClick={() => {
            const p = project.emitters
              .find((e) => e.id === selection.emitterId)
              ?.patterns.find((x) => x.id === selection.patternId)
            if (!p) return
            setStartSec(p.startFrame / FPS)
            setLengthSec(Math.min(20, (p.endFrame - p.startFrame) / FPS))
          }}
        >
          選択中のパターンの範囲にあわせる
        </Btn>
      )}
      <Field label="幅">
        <Select
          value={String(width)}
          options={WIDTHS}
          onChange={(v) => setWidth(parseInt(v, 10))}
        />
      </Field>
      <Field label="フレームレート">
        <Select value={String(step)} options={STEPS} onChange={(v) => setStep(parseInt(v, 10))} />
      </Field>

      <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
        {width}×{height}px / {frameCount} コマ / {Math.round(1000 / gifDelayMs(step))} fps
        {frameCount > 160 && (
          <span className="text-[#d97706]">　※ コマ数が多いとファイルが大きくなります</span>
        )}
      </p>

      <Btn tone="primary" className="w-full" disabled={busy} onClick={run}>
        {busy ? '書き出し中…' : 'GIF を書き出す'}
      </Btn>

      {progress && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width]"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-[10.5px] text-[var(--muted)]">
            {progress.phase === 'capture' ? 'コマを描画中' : 'GIF に変換中'} {progress.current} /{' '}
            {progress.total}
          </p>
        </div>
      )}

      {error && <p className="text-[11px] text-[#e05260]">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-lg border border-[var(--border)] p-2">
          <img
            src={result.url}
            alt="GIF プレビュー"
            className="mx-auto max-h-[200px] rounded-md"
            style={{ imageRendering: 'auto' }}
          />
          <p className="text-[10.5px] text-[var(--muted)]">
            {formatBytes(result.size)} / {result.frames} コマ
            {tooBig ? (
              <span className="text-[#e05260]">
                　Discord の上限 10MB を超えています。幅か長さを下げてください
              </span>
            ) : (
              <span className="text-[#16a34a]">　Discord にそのまま貼れます</span>
            )}
          </p>
          <div className="flex gap-1.5">
            <Btn
              className="flex-1"
              onClick={async () => {
                const blob = await (await fetch(result.url)).blob()
                downloadBlob(`${project.name}_${startFrame}-${endFrame}F.gif`, blob)
              }}
            >
              保存
            </Btn>
            <Btn
              className="flex-1"
              onClick={async () => {
                try {
                  const blob = await (await fetch(result.url)).blob()
                  await navigator.clipboard.write([new ClipboardItem({ 'image/gif': blob })])
                } catch {
                  setError('このブラウザは GIF のクリップボードコピーに対応していません。保存してください')
                }
              }}
            >
              コピー
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
