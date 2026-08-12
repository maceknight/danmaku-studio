import { useEffect } from 'react'
import { audioEngine } from './audio/engine'
import { loadShotSheet } from './io/shotData'
import { useStore, type MobileTab } from './store/useStore'
import { useIsNarrow } from './ui/useMediaQuery'
import { ExportPanel } from './ui/ExportPanel'
import { ObjectPanel } from './ui/ObjectPanel'
import { PatternLibrary } from './ui/PatternLibrary'
import { Preview } from './ui/Preview'
import { Properties } from './ui/Properties'
import { SampleDialog } from './ui/SampleDialog'
import { SettingsDialog } from './ui/SettingsDialog'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

const THEME_KEY = 'danmaku-studio.theme'

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'timeline', label: 'タイムライン' },
  { id: 'objects', label: 'オブジェクト' },
  { id: 'library', label: 'ライブラリ' },
  { id: 'properties', label: 'プロパティ' },
  { id: 'export', label: '出力' },
]

/**
 * Narrow layout: the preview stays pinned so you can always see the danmaku,
 * and one panel at a time sits under it behind a tab bar.
 */
function MobileShell() {
  const tab = useStore((s) => s.mobileTab)
  const setTab = useStore((s) => s.setMobileTab)

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5">
      {/* grid, not a plain div: a lone grid child stretches to fill both axes,
          which is what gives the Card (and the Pixi host inside it) a height. */}
      <div className="grid min-h-[38vh] flex-[1.1]">
        <Preview />
      </div>

      <nav className="flex shrink-0 gap-1 overflow-x-auto">
        {MOBILE_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-lg px-3 py-2 text-[12px] whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-[var(--accent)] font-semibold text-white'
                : 'border border-[var(--border)] bg-[var(--card)] text-[var(--text-2)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 min-w-0 flex-1">
        {tab === 'timeline' && <Timeline />}
        {tab === 'objects' && <ObjectPanel />}
        {tab === 'library' && <PatternLibrary />}
        {tab === 'properties' && <Properties />}
        {tab === 'export' && <ExportPanel />}
      </div>
    </main>
  )
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const playing = useStore((s) => s.playing)
  const reverse = useStore((s) => s.reverse)
  const rate = useStore((s) => s.rate)
  const narrow = useIsNarrow()

  // Theme → document attribute + persistence
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') useStore.getState().setTheme(saved)
  }, [])

  // Bundled ph3 shot sheet — makes the preview draw the real sprites.
  useEffect(() => {
    let cancelled = false
    const base = import.meta.env.BASE_URL
    loadShotSheet(
      `${base}shotdata/bullet00.dnh`,
      `${base}shotdata/bullet00_const.dnh`,
      `${base}shotdata/bullet00.png`,
    )
      .then(({ sheet, image, labels }) => {
        if (!cancelled) useStore.getState().setShotSheet(sheet, image, 'bullet00', labels)
      })
      .catch((err: Error) => {
        if (!cancelled) useStore.getState().setShotSheet(null, null, '', undefined, err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 自機 sprite for play mode — same load shape as the shot sheet above.
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) useStore.getState().setPlayerSprite(img)
    }
    img.src = `${import.meta.env.BASE_URL}player/reimu.png`
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Audio follows the transport, never the scrubber.
  useEffect(() => {
    const s = useStore.getState()
    if (playing && !reverse) audioEngine.start(s.project, s.frame, rate)
    else audioEngine.stop()
    return () => audioEngine.stop()
  }, [playing, reverse, rate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.code === 'KeyZ') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
        return
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && e.code === 'KeyD') {
        e.preventDefault()
        s.duplicateSelection()
        return
      }
      if (mod && e.code === 'KeyS') {
        e.preventDefault()
        return
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          s.setReverse(false)
          s.setPlaying(!s.playing)
          break
        case 'ArrowRight':
          // in play mode these keys drive 自機 movement instead (see Preview.tsx)
          if (s.playMode) break
          e.preventDefault()
          s.nudgeFrame(e.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          if (s.playMode) break
          e.preventDefault()
          s.nudgeFrame(e.shiftKey ? -10 : -1)
          break
        case 'Home':
          if (!s.playMode) s.setFrame(0)
          break
        case 'End':
          if (!s.playMode) s.setFrame(s.project.settings.duration)
          break
        case 'Delete':
        case 'Backspace':
          s.deleteSelection()
          break
        case 'KeyL':
          s.setLoopPlayback(!s.loopPlayback)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg)]">
      <TopBar />

      {narrow ? (
        <MobileShell />
      ) : (
        /*
          Every track needs min-width:0. Grid/flex items default to min-width:auto,
          so a wide child (the timeline lane) would blow the 1fr track out and push
          the right-hand column off screen when the duration grows.
        */
        <main
          className="grid min-h-0 flex-1 gap-2.5 overflow-hidden p-2.5"
          style={{ gridTemplateColumns: '260px minmax(0, 1fr) 320px' }}
        >
          {/* 1 — objects + library */}
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <ObjectPanel />
            <PatternLibrary />
          </div>

          {/* 2 + 3 — preview over timeline */}
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2.5">
            <Preview />
            <Timeline />
          </div>

          {/* 4 + 5 — properties over export */}
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-2.5">
            <Properties />
            <ExportPanel />
          </div>
        </main>
      )}

      <SettingsDialog />
      <SampleDialog />
    </div>
  )
}
