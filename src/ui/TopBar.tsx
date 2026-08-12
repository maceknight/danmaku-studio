import { useState } from 'react'
import { exportPh3, openDmk, saveDmk } from '../io/projectIo'
import { useStore, type PlayRate } from '../store/useStore'
import { Btn, IconBtn, Select, Toggle } from './widgets'
import { Icon } from './icons'
import { captureStage } from './Preview'
import { useIsNarrow } from './useMediaQuery'

const RATES: { value: string; label: string }[] = [
  { value: '0.25', label: 'x0.25' },
  { value: '0.5', label: 'x0.5' },
  { value: '1', label: 'x1.0' },
  { value: '2', label: 'x2.0' },
  { value: '4', label: 'x4.0' },
]

/** Phone-width bar: identity, transport, samples, theme. Nothing else fits. */
function CompactBar() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const playMode = useStore((s) => s.playMode)
  const theme = useStore((s) => s.theme)
  const past = useStore((s) => s.past.length)
  const s = useStore.getState

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--card)] px-2">
      <span className="text-[var(--accent)]">
        <Icon.logo />
      </span>
      <button
        onClick={() => s().select({ type: 'project' })}
        className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--text)]"
      >
        {project.name}
      </button>
      <IconBtn title="元に戻す" disabled={past === 0} onClick={() => s().undo()}>
        <Icon.undo />
      </IconBtn>
      <IconBtn
        title={playing ? '停止' : '再生'}
        active={playing}
        onClick={() => {
          s().setReverse(false)
          s().setPlaying(!playing)
        }}
      >
        {playing ? <Icon.pause /> : <Icon.play />}
      </IconBtn>
      <IconBtn
        title={playMode ? 'プレイモード終了' : 'プレイモード（自機を操作）'}
        active={playMode}
        onClick={() => s().setPlayMode(!playMode)}
      >
        <Icon.gamepad />
      </IconBtn>
      <Btn onClick={() => s().setShowSamples(true)}>サンプル</Btn>
      <IconBtn title="テーマ切替" onClick={() => s().toggleTheme()}>
        {theme === 'light' ? <Icon.sun /> : <Icon.moon />}
      </IconBtn>
      <IconBtn title="設定" onClick={() => s().setShowSettings(true)}>
        <Icon.gear />
      </IconBtn>
    </header>
  )
}

export function TopBar() {
  const narrow = useIsNarrow()
  if (narrow) return <CompactBar />
  return <WideBar />
}

function WideBar() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.playing)
  const playMode = useStore((s) => s.playMode)
  const rate = useStore((s) => s.rate)
  const loopPlayback = useStore((s) => s.loopPlayback)
  const theme = useStore((s) => s.theme)
  const past = useStore((s) => s.past.length)
  const future = useStore((s) => s.future.length)
  const [renaming, setRenaming] = useState(false)

  const s = useStore.getState

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--card)] px-3">
      <span className="text-[var(--accent)]">
        <Icon.logo />
      </span>
      <span className="mr-2 text-[15px] font-bold tracking-tight">Danmaku Editor</span>

      <IconBtn
        title="開く"
        onClick={async () => {
          const p = await openDmk()
          if (p) s().loadProject(p)
        }}
      >
        <Icon.open />
      </IconBtn>
      <IconBtn title="保存 (.dmk)" onClick={() => saveDmk(project)}>
        <Icon.save />
      </IconBtn>
      <Btn onClick={() => s().setShowSamples(true)} title="サンプルプロジェクトを開く">
        サンプル
      </Btn>

      <span className="mx-1 h-5 w-px bg-[var(--border)]" />

      <IconBtn title="元に戻す (Ctrl+Z)" disabled={past === 0} onClick={() => s().undo()}>
        <Icon.undo />
      </IconBtn>
      <IconBtn title="やり直す (Ctrl+Shift+Z)" disabled={future === 0} onClick={() => s().redo()}>
        <Icon.redo />
      </IconBtn>

      {/* file name */}
      <div className="mx-2 flex min-w-0 flex-1 justify-center">
        <div className="flex h-8 w-full max-w-[420px] items-center gap-1 rounded-lg border border-[var(--border)] px-3">
          {renaming ? (
            <input
              autoFocus
              type="text"
              value={project.name}
              onChange={(e) => s().mutate((p) => void (p.name = e.target.value))}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
              className="!border-0 !bg-transparent !px-0 text-center !shadow-none"
            />
          ) : (
            <button
              onClick={() => setRenaming(true)}
              className="min-w-0 flex-1 truncate text-center text-[12.5px] text-[var(--text)]"
              title="クリックで名前を変更"
            >
              {project.name}.dmk
            </button>
          )}
          <span className="text-[var(--muted)]">
            <Icon.chevron />
          </span>
        </div>
      </div>

      <IconBtn
        title={playing ? '停止 (Space)' : '再生 (Space)'}
        active={playing}
        onClick={() => {
          s().setReverse(false)
          s().setPlaying(!playing)
        }}
      >
        {playing ? <Icon.pause /> : <Icon.play />}
      </IconBtn>
      <IconBtn title="1フレーム送り (→)" onClick={() => s().nudgeFrame(1)}>
        <Icon.step />
      </IconBtn>
      <Btn
        active={playMode}
        title={playMode ? 'プレイモード終了' : '自機をキーボードで操作（移動のみ）'}
        onClick={() => s().setPlayMode(!playMode)}
      >
        <span className="flex items-center gap-1.5">
          <Icon.gamepad />
          プレイ
        </span>
      </Btn>

      <div className="w-[86px]">
        <Select
          value={String(rate)}
          options={RATES}
          onChange={(v) => s().setRate(parseFloat(v) as PlayRate)}
        />
      </div>

      <Toggle checked={loopPlayback} onChange={(v) => s().setLoopPlayback(v)} label="ループ" />

      <IconBtn
        title="プレビューをPNGで保存"
        onClick={async () => {
          const url = await captureStage()
          if (!url) return
          const a = document.createElement('a')
          a.href = url
          a.download = `${project.name}_${String(s().frame).padStart(5, '0')}F.png`
          a.click()
        }}
      >
        <Icon.camera />
      </IconBtn>

      <span className="mx-1 h-5 w-px bg-[var(--border)]" />

      <Btn
        onClick={() => {
          s().setExportTab('script')
          exportPh3(project)
        }}
        className="!border-[var(--accent)] !text-[var(--accent-ink)]"
      >
        スクリプト出力
      </Btn>
      <Btn onClick={() => s().setShowSettings(true)}>
        <span className="flex items-center gap-1.5">
          <Icon.gear />
          設定
        </span>
      </Btn>
      <IconBtn
        title={theme === 'light' ? 'ダークテーマ' : 'ライトテーマ'}
        onClick={() => s().toggleTheme()}
      >
        {theme === 'light' ? <Icon.sun /> : <Icon.moon />}
      </IconBtn>
    </header>
  )
}
