import { useEffect } from 'react'
import { audioEngine } from './audio/engine'
import { useStore } from './store/useStore'
import { ExportPanel } from './ui/ExportPanel'
import { ObjectPanel } from './ui/ObjectPanel'
import { PatternLibrary } from './ui/PatternLibrary'
import { Preview } from './ui/Preview'
import { Properties } from './ui/Properties'
import { SettingsDialog } from './ui/SettingsDialog'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

const THEME_KEY = 'danmaku-studio.theme'

export default function App() {
  const theme = useStore((s) => s.theme)
  const playing = useStore((s) => s.playing)
  const reverse = useStore((s) => s.reverse)
  const rate = useStore((s) => s.rate)

  // Theme → document attribute + persistence
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') useStore.getState().setTheme(saved)
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
          e.preventDefault()
          s.nudgeFrame(e.shiftKey ? 10 : 1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.nudgeFrame(e.shiftKey ? -10 : -1)
          break
        case 'Home':
          s.setFrame(0)
          break
        case 'End':
          s.setFrame(s.project.settings.duration)
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

      <main className="grid min-h-0 flex-1 gap-2.5 p-2.5" style={{ gridTemplateColumns: '260px 1fr 320px' }}>
        {/* 1 — objects + library */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
          <ObjectPanel />
          <PatternLibrary />
        </div>

        {/* 2 + 3 — preview over timeline */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2.5">
          <Preview />
          <Timeline />
        </div>

        {/* 4 + 5 — properties over export */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2.5">
          <Properties />
          <ExportPanel />
        </div>
      </main>

      <SettingsDialog />
    </div>
  )
}
