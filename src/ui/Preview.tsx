import { useEffect, useRef } from 'react'
import { Simulator } from '../engine/sim'
import { estimateFrames, type GifOptions, type GifProgress } from '../io/gifExport'
import { StageRenderer } from '../render/stage'
import { useStore, type PreviewTool } from '../store/useStore'
import { formatTimecode } from '../types/dmk'
import { Card, Checkbox, IconBtn } from './widgets'
import { Icon } from './icons'

/** Module-level handles so the top bar and the export panel can drive the
 *  live renderer / simulator without threading refs through the tree. */
let activeRenderer: StageRenderer | null = null
let activeSim: Simulator | null = null
/** While true the rAF loop yields the renderer to the GIF recorder. */
let recording = false

export async function captureStage(): Promise<string | null> {
  return activeRenderer ? activeRenderer.capture() : null
}

/**
 * Replays the timeline through the live renderer and captures each sampled
 * frame. Playback is paused and the view is reset to "fit" so the recording is
 * framed on the stage rather than on whatever the user had panned to.
 */
export async function recordGifFrames(
  opts: GifOptions,
  onProgress?: (p: GifProgress) => void,
): Promise<{ frames: Uint8ClampedArray[]; width: number; height: number } | null> {
  const r = activeRenderer
  const sim = activeSim
  if (!r || !sim || !r.isReady) return null

  const store = useStore.getState()
  const settings = store.project.settings
  const savedFrame = store.frame
  const savedZoom = r.zoom
  const savedPanX = r.panX
  const savedPanY = r.panY

  const width = Math.max(64, Math.round(opts.width))
  const height = Math.round((width * settings.stageHeight) / settings.stageWidth)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  recording = true
  store.setPlaying(false)
  r.fit()
  r.layout(settings)

  const frames: Uint8ClampedArray[] = []
  const total = estimateFrames(opts)
  try {
    let i = 0
    for (let f = opts.startFrame; f <= opts.endFrame; f += Math.max(1, opts.frameStep)) {
      const view = sim.seek(f)
      r.render(view, settings, {
        showGrid: store.showGrid,
        showHitbox: false, // hitboxes are an editing aid, not something to share
        showTrails: store.showTrails,
        selectedEmitterId: null,
        dark: store.theme === 'dark',
      })
      r.drawStageInto(ctx, width, height, settings)
      frames.push(ctx.getImageData(0, 0, width, height).data)
      i++
      onProgress?.({ current: i, total, phase: 'capture' })
      if (i % 3 === 0) await new Promise((res) => setTimeout(res, 0))
    }
  } finally {
    recording = false
    r.zoom = savedZoom
    r.panX = savedPanX
    r.panY = savedPanY
    useStore.getState().setFrame(savedFrame)
  }

  return { frames, width, height }
}

/** Last rendered emitter positions — hit-testing must use these, not the
 *  static x/y, because keyframed emitters move. */
let lastMarkers: { id: string; x: number; y: number }[] = []

const TOOLS: { id: PreviewTool; title: string; icon: () => React.ReactNode }[] = [
  { id: 'pan', title: '手のひら（ドラッグで移動）', icon: Icon.hand },
  { id: 'select', title: '選択（エミッターをクリック）', icon: Icon.cursor },
  { id: 'move', title: 'エミッターを移動', icon: Icon.move },
  { id: 'zoomIn', title: 'ズームイン', icon: Icon.zoomIn },
  { id: 'zoomOut', title: 'ズームアウト', icon: Icon.zoomOut },
]

/**
 * Bridges the three worlds: Zustand (edit state) → Simulator (frame state) →
 * PixiJS (pixels). React never re-renders per frame; the loop reads the store
 * imperatively through getState().
 */
export function Preview() {
  const hostRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<StageRenderer | null>(null)

  const tool = useStore((s) => s.tool)
  const showGrid = useStore((s) => s.showGrid)
  const showHitbox = useStore((s) => s.showHitbox)
  const showTrails = useStore((s) => s.showTrails)
  const frame = useStore((s) => s.frame)
  const bulletCount = useStore((s) => s.bulletCount)
  const emitterCount = useStore((s) => s.emitterCount)
  const fps = useStore((s) => s.fps)
  const cursor = useStore((s) => s.cursor)
  const st = useStore.getState

  useEffect(() => {
    let disposed = false
    const renderer = new StageRenderer()
    const host = hostRef.current!
    let raf = 0

    renderer.init(host).then(() => {
      if (disposed) {
        renderer.destroy()
        return
      }
      rendererRef.current = renderer
      activeRenderer = renderer
      const sim = new Simulator(st().project)
      activeSim = sim

      let lastRevision = -1
      let lastTime = performance.now()
      let accumulator = 0
      let fpsAccum = 0
      let fpsFrames = 0

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop)
        const dt = Math.min(now - lastTime, 250)
        lastTime = now
        // the GIF recorder owns the renderer while it runs
        if (recording) return
        const s = st()

        if (s.revision !== lastRevision) {
          lastRevision = s.revision
          sim.setProject(s.project)
        }

        renderer.setTheme(s.theme === 'dark')
        renderer.layout(s.project.settings)

        if (s.playing) {
          accumulator += (dt / 1000) * 60 * s.rate * (s.reverse ? -1 : 1)
          const whole = Math.trunc(accumulator)
          if (whole !== 0) {
            accumulator -= whole
            let next = s.frame + whole
            const end = s.project.settings.duration
            if (next > end) {
              if (s.loopPlayback) next = 0
              else {
                next = end
                s.setPlaying(false)
              }
            }
            if (next < 0) {
              if (s.loopPlayback) next = end
              else {
                next = 0
                s.setPlaying(false)
              }
            }
            s.setFrame(next)
          }
        } else {
          accumulator = 0
        }

        const view = sim.seek(st().frame)
        lastMarkers = view.emitters.map((e) => ({ id: e.id, x: e.x, y: e.y }))
        renderer.render(view, s.project.settings, {
          showGrid: s.showGrid,
          showHitbox: s.showHitbox,
          showTrails: s.showTrails,
          selectedEmitterId: selectedEmitter(s),
          dark: s.theme === 'dark',
        })

        fpsAccum += dt
        fpsFrames++
        if (fpsAccum >= 500) {
          st().setStats(
            view.bulletCount,
            view.emitters.filter((e) => e.active).length,
            Math.round((fpsFrames * 1000) / fpsAccum),
            sim.lastStepMs,
          )
          fpsAccum = 0
          fpsFrames = 0
        }
      }
      raf = requestAnimationFrame(loop)
    })

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      if (rendererRef.current) {
        if (activeRenderer === rendererRef.current) {
          activeRenderer = null
          activeSim = null
        }
        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, [])

  // --- pointer interaction --------------------------------------------------
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const moving = useRef<{ id: string; ox: number; oy: number } | null>(null)

  const stagePoint = (e: React.PointerEvent) => {
    const r = rendererRef.current
    const host = hostRef.current
    if (!r || !host) return { x: 0, y: 0 }
    const rect = host.getBoundingClientRect()
    return r.toStage(e.clientX - rect.left, e.clientY - rect.top)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const r = rendererRef.current
    if (!r) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = stagePoint(e)

    if (tool === 'zoomIn' || tool === 'zoomOut') {
      r.zoom = Math.max(0.2, Math.min(6, r.zoom * (tool === 'zoomIn' ? 1.25 : 0.8)))
      return
    }
    if (tool === 'pan') {
      drag.current = { x: e.clientX, y: e.clientY, panX: r.panX, panY: r.panY }
      return
    }
    // select / move — hit-test emitters
    const hit = nearestEmitter(p.x, p.y)
    if (hit) {
      st().select({ type: 'emitter', emitterId: hit.id })
      if (tool === 'move') moving.current = { id: hit.id, ox: p.x - hit.x, oy: p.y - hit.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const r = rendererRef.current
    if (!r) return
    const p = stagePoint(e)
    st().setCursor(p.x, p.y)

    if (drag.current) {
      r.panX = drag.current.panX + (e.clientX - drag.current.x)
      r.panY = drag.current.panY + (e.clientY - drag.current.y)
    } else if (moving.current) {
      st().moveEmitterTo(
        moving.current.id,
        Math.round(p.x - moving.current.ox),
        Math.round(p.y - moving.current.oy),
        st().frame,
      )
    }
  }

  const onPointerUp = () => {
    drag.current = null
    moving.current = null
  }

  return (
    <Card
      index={2}
      title="プレビュー"
      right={
        <>
          <Checkbox checked={showHitbox} onChange={(v) => st().setShowHitbox(v)} label="当たり判定" />
          <Checkbox checked={showTrails} onChange={(v) => st().setShowTrails(v)} label="軌跡" />
          <Checkbox checked={showGrid} onChange={(v) => st().setShowGrid(v)} label="グリッド" />
          <IconBtn title="プロジェクト設定" size={28} onClick={() => st().setShowSettings(true)}>
            <Icon.gear />
          </IconBtn>
        </>
      }
      bodyClassName="relative overflow-hidden rounded-b-[14px]"
    >
      <div
        ref={hostRef}
        className="h-full w-full"
        style={{
          cursor:
            tool === 'pan'
              ? 'grab'
              : tool === 'zoomIn'
                ? 'zoom-in'
                : tool === 'zoomOut'
                  ? 'zoom-out'
                  : tool === 'move'
                    ? 'move'
                    : 'default',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* tool palette */}
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-[var(--shadow)]">
        {TOOLS.map((t) => (
          <IconBtn key={t.id} title={t.title} active={tool === t.id} onClick={() => st().setTool(t.id)}>
            {t.icon()}
          </IconBtn>
        ))}
        <IconBtn
          title="全体表示"
          onClick={() => {
            rendererRef.current?.fit()
          }}
        >
          <Icon.fit />
        </IconBtn>
      </div>

      {/* stats */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-[var(--border)] bg-[var(--card)]/90 px-3 py-2 font-mono text-[10.5px] text-[var(--text-2)] shadow-[var(--shadow)] backdrop-blur">
        <Stat label="TIME" value={formatTimecode(frame)} />
        <Stat label="BULLET" value={String(bulletCount)} />
        <Stat label="EMITTER" value={String(emitterCount)} />
        <Stat label="FPS" value={String(fps)} />
      </div>

      <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/90 px-2.5 py-1.5 font-mono text-[10.5px] text-[var(--text-2)] shadow-[var(--shadow)] backdrop-blur">
        X: {cursor.x.toFixed(2)}　Y: {cursor.y.toFixed(2)}
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-[52px] text-[var(--muted)]">{label}</span>
      <span className="text-[var(--text)]">{value}</span>
    </div>
  )
}

function selectedEmitter(s: ReturnType<typeof useStore.getState>): string | null {
  const sel = s.selection
  if (sel && (sel.type === 'emitter' || sel.type === 'pattern')) return sel.emitterId
  return null
}

/** Nearest emitter within 24 stage units of the point. */
function nearestEmitter(x: number, y: number) {
  let best: { id: string; x: number; y: number; d: number } | null = null
  for (const e of lastMarkers) {
    const d = Math.hypot(e.x - x, e.y - y)
    if (d < 24 && (!best || d < best.d)) best = { id: e.id, x: e.x, y: e.y, d }
  }
  return best
}
