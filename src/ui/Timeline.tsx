import { useCallback, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { FPS, type EmitterDef, type Pattern, type SoundDef } from '../types/dmk'
import { LIBRARY_DRAG_TYPE } from './PatternLibrary'
import { Btn, Card, IconBtn, Select } from './widgets'
import { Icon } from './icons'

/** Track-header width. Kept tight so phones still get usable lane space. */
const HEAD_W = 128
const ROW_H = 24
const GROUP_H = 22

type Clipboard = { kind: 'pattern'; data: Pattern } | null
let clipboard: Clipboard = null

/**
 * A pattern *is* a clip: rows are patterns, groups are emitters. Emitter motion
 * keyframes live on the group row, so keyframe editing and event editing sit on
 * the same surface.
 */
export function Timeline() {
  const project = useStore((s) => s.project)
  const frame = useStore((s) => s.frame)
  const selection = useStore((s) => s.selection)
  const timeUnit = useStore((s) => s.timeUnit)
  const s = useStore.getState

  const [pxPerFrame, setPxPerFrame] = useState(1.55)
  const scrollRef = useRef<HTMLDivElement>(null)
  const duration = project.settings.duration
  const laneW = Math.max(400, duration * pxPerFrame + 60)

  const frameFromEvent = useCallback(
    (clientX: number) => {
      const el = scrollRef.current
      if (!el) return 0
      const r = el.getBoundingClientRect()
      return Math.max(0, Math.round((clientX - r.left + el.scrollLeft - HEAD_W) / pxPerFrame))
    },
    [pxPerFrame],
  )

  const scrubbing = useRef(false)

  return (
    <Card
      index={3}
      title="タイムライン"
      right={
        <>
          <IconBtn title="ズームアウト" size={26} onClick={() => setPxPerFrame((v) => Math.max(0.3, v / 1.3))}>
            <Icon.zoomOut />
          </IconBtn>
          <IconBtn title="ズームイン" size={26} onClick={() => setPxPerFrame((v) => Math.min(10, v * 1.3))}>
            <Icon.zoomIn />
          </IconBtn>
          <input
            type="range"
            min={0.3}
            max={10}
            step={0.05}
            value={pxPerFrame}
            onChange={(e) => setPxPerFrame(parseFloat(e.target.value))}
            className="w-[110px]"
          />
        </>
      }
      bodyClassName="flex flex-col"
    >
      <div ref={scrollRef} className="min-h-0 w-full min-w-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: HEAD_W + laneW }}>
          {/* ruler */}
          <div className="sticky top-0 z-30 flex h-7">
            <div
              className="sticky left-0 z-40 shrink-0 border-r border-b border-[var(--border)] bg-[var(--card)]"
              style={{ width: HEAD_W }}
            />
            <div
              className="drag-surface relative shrink-0 cursor-ew-resize border-b border-[var(--border)] bg-[var(--card)]"
              style={{ width: laneW }}
              onPointerDown={(e) => {
                scrubbing.current = true
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                s().setFrame(frameFromEvent(e.clientX))
              }}
              onPointerMove={(e) => scrubbing.current && s().setFrame(frameFromEvent(e.clientX))}
              onPointerUp={() => (scrubbing.current = false)}
            >
              <Ticks duration={duration} pxPerFrame={pxPerFrame} unit={timeUnit} />
            </div>
          </div>

          {project.emitters.map((e) => (
            <EmitterGroup
              key={e.id}
              emitter={e}
              laneW={laneW}
              pxPerFrame={pxPerFrame}
              duration={duration}
              frameFromEvent={frameFromEvent}
            />
          ))}

          {project.sounds.length > 0 && (
            <>
              <GroupRow label="Audio" laneW={laneW} />
              {project.sounds.map((snd) => (
                <SoundRow key={snd.id} sound={snd} laneW={laneW} pxPerFrame={pxPerFrame} />
              ))}
            </>
          )}

          {/* playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-[var(--accent)]"
            style={{ left: HEAD_W + frame * pxPerFrame }}
          >
            <div className="absolute top-0 -left-[13px] rounded-[4px] bg-[var(--accent)] px-1 py-[1px] font-mono text-[9px] leading-[12px] text-white">
              {timeUnit === 'second' ? `${(frame / FPS).toFixed(1)}s` : `${frame}`}
            </div>
          </div>
        </div>
      </div>

      {/* action bar */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-[var(--border)] px-3 py-2">
        <Btn
          onClick={() => {
            const sel = s().selection
            const emitterId =
              sel?.type === 'emitter' || sel?.type === 'pattern'
                ? sel.emitterId
                : project.emitters[0]?.id
            if (emitterId) s().addPattern(emitterId, 'circle', s().frame)
          }}
        >
          <span className="flex items-center gap-1.5">
            <Icon.plus /> イベント追加
          </span>
        </Btn>
        <Btn
          disabled={selection?.type !== 'pattern'}
          onClick={() => {
            const sel = s().selection
            if (sel?.type !== 'pattern') return
            const pat = project.emitters
              .find((e) => e.id === sel.emitterId)
              ?.patterns.find((p) => p.id === sel.patternId)
            if (pat) clipboard = { kind: 'pattern', data: structuredClone(pat) }
          }}
        >
          <span className="flex items-center gap-1.5">
            <Icon.copy /> コピー
          </span>
        </Btn>
        <Btn
          onClick={() => {
            if (!clipboard) return
            const sel = s().selection
            const emitterId =
              sel?.type === 'emitter' || sel?.type === 'pattern'
                ? sel.emitterId
                : project.emitters[0]?.id
            if (!emitterId) return
            const src = clipboard.data
            const len = src.endFrame - src.startFrame
            s().mutate((p) => {
              const e = p.emitters.find((x) => x.id === emitterId)
              if (!e) return
              const copy = structuredClone(src)
              copy.id = `pat_${Math.random().toString(36).slice(2, 9)}`
              copy.modifiers = copy.modifiers.map((m) => ({
                ...m,
                id: `mod_${Math.random().toString(36).slice(2, 9)}`,
              }))
              copy.startFrame = s().frame
              copy.endFrame = s().frame + len
              e.patterns.push(copy)
            })
          }}
        >
          <span className="flex items-center gap-1.5">
            <Icon.paste /> 貼り付け
          </span>
        </Btn>
        <Btn
          tone="danger"
          disabled={!selection || selection.type === 'project'}
          onClick={() => s().deleteSelection()}
        >
          <span className="flex items-center gap-1.5">
            <Icon.trash /> 削除
          </span>
        </Btn>
        <Btn
          onClick={() => {
            const first = project.emitters[0]
            if (first) s().select({ type: 'emitter', emitterId: first.id })
          }}
        >
          <span className="flex items-center gap-1.5">
            <Icon.select /> すべて選択
          </span>
        </Btn>

        <div className="flex-1" />
        <div className="w-[104px]">
          <Select
            value={timeUnit}
            options={[
              { value: 'frame', label: 'フレーム' },
              { value: 'second', label: '秒' },
            ]}
            onChange={(v) => s().setTimeUnit(v)}
          />
        </div>
        <div className="w-[92px]">
          <Select value="60" options={[{ value: '60', label: '60 FPS' }]} onChange={() => {}} />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------

const KEY_CHANNELS = [
  { key: 'x' as const, label: 'X' },
  { key: 'y' as const, label: 'Y' },
  { key: 'rotation' as const, label: 'R' },
]

function EmitterGroup({
  emitter,
  laneW,
  pxPerFrame,
  duration,
  frameFromEvent,
}: {
  emitter: EmitterDef
  laneW: number
  pxPerFrame: number
  duration: number
  frameFromEvent: (clientX: number) => number
}) {
  const selection = useStore((s) => s.selection)
  const s = useStore.getState
  const [dropHint, setDropHint] = useState(false)

  const groupSelected = selection?.type === 'emitter' && selection.emitterId === emitter.id
  const showKeys = groupSelected || selection?.type === 'pattern'
    ? selection.type === 'emitter'
      ? true
      : selection.emitterId === emitter.id
    : false

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(LIBRARY_DRAG_TYPE)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropHint(true)
        }
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(e) => {
        const type = e.dataTransfer.getData(LIBRARY_DRAG_TYPE)
        setDropHint(false)
        if (!type) return
        e.preventDefault()
        s().addPattern(emitter.id, type as Pattern['type'], frameFromEvent(e.clientX))
      }}
      className={dropHint ? 'bg-[var(--accent-soft)]' : ''}
    >
      {/* group header */}
      <div className="flex">
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] bg-[var(--card-2)] px-2"
          style={{ width: HEAD_W, height: GROUP_H }}
        >
          <button
            className="text-[9px] text-[var(--muted)]"
            onClick={() => s().toggleEmitterCollapsed(emitter.id)}
          >
            {emitter.collapsed ? '▸' : '▾'}
          </button>
          <button
            onClick={() => s().select({ type: 'emitter', emitterId: emitter.id })}
            className={`min-w-0 flex-1 truncate text-left text-[11px] ${
              groupSelected ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--text-2)]'
            }`}
          >
            {emitter.name}
          </button>
        </div>
        <div
          className="relative shrink-0 border-b border-[var(--border)] bg-[var(--card-2)]"
          style={{ width: laneW, height: GROUP_H }}
        >
          <Gridlines duration={duration} pxPerFrame={pxPerFrame} />
        </div>
      </div>

      {!emitter.collapsed &&
        emitter.patterns.map((p) => (
          <PatternRow
            key={p.id}
            emitterId={emitter.id}
            pattern={p}
            laneW={laneW}
            pxPerFrame={pxPerFrame}
            duration={duration}
            selected={selection?.type === 'pattern' && selection.patternId === p.id}
          />
        ))}

      {!emitter.collapsed &&
        showKeys &&
        KEY_CHANNELS.map((ch) => {
          const keys = emitter.keys[ch.key]
          if (keys.length === 0) return null
          return (
            <div key={ch.key} className="flex">
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] bg-[var(--card)] pl-7 text-[10px] text-[var(--muted)]"
                style={{ width: HEAD_W, height: 16 }}
              >
                <span className="text-[#f5a524]">◆</span> Position {ch.label}
              </div>
              <div
                className="relative shrink-0 border-b border-[var(--border)]"
                style={{ width: laneW, height: 16 }}
              >
                {keys.map((k) => (
                  <KeyDot
                    key={k.id}
                    left={k.frame * pxPerFrame}
                    title={`${ch.label} @ ${k.frame}F = ${k.value.toFixed(1)}`}
                    onDrag={(cx) =>
                      s().updateKeyframe(emitter.id, ch.key, k.id, { frame: frameFromEvent(cx) })
                    }
                    onAltClick={() => s().removeKeyframe(emitter.id, ch.key, k.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
    </div>
  )
}

function GroupRow({ label, laneW }: { label: string; laneW: number }) {
  return (
    <div className="flex">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r border-b border-[var(--border)] bg-[var(--card-2)] px-2 text-[11px] text-[var(--text-2)]"
        style={{ width: HEAD_W, height: GROUP_H }}
      >
        ▾ {label}
      </div>
      <div
        className="shrink-0 border-b border-[var(--border)] bg-[var(--card-2)]"
        style={{ width: laneW, height: GROUP_H }}
      />
    </div>
  )
}

function PatternRow({
  emitterId,
  pattern: p,
  laneW,
  pxPerFrame,
  duration,
  selected,
}: {
  emitterId: string
  pattern: Pattern
  laneW: number
  pxPerFrame: number
  duration: number
  selected: boolean
}) {
  const s = useStore.getState
  const drag = useRef<{ mode: 'move' | 'l' | 'r'; x: number; a: number; b: number } | null>(null)

  const begin = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation()
    s().select({ type: 'pattern', emitterId, patternId: p.id })
    drag.current = { mode, x: e.clientX, a: p.startFrame, b: p.endFrame }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const delta = Math.round((e.clientX - d.x) / pxPerFrame)
    if (d.mode === 'move')
      s().updatePattern(emitterId, p.id, { startFrame: d.a + delta, endFrame: d.b + delta })
    else if (d.mode === 'l')
      s().updatePattern(emitterId, p.id, { startFrame: Math.min(d.b - 1, Math.max(0, d.a + delta)) })
    else s().updatePattern(emitterId, p.id, { endFrame: Math.max(d.a + 1, d.b + delta) })
  }
  const end = () => (drag.current = null)

  // shot markers inside the clip
  const shots: number[] = []
  const span = p.endFrame - p.startFrame
  const step = Math.max(1, p.interval)
  if (span / step < 400) {
    for (let f = p.offset; f <= span; f += step) shots.push(f)
  }
  const markerStride = Math.max(1, Math.ceil(shots.length / 12))

  return (
    <div className="flex">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-b border-[var(--border)] bg-[var(--card)] pr-2 pl-6"
        style={{ width: HEAD_W, height: ROW_H }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
        <button
          onClick={() => s().select({ type: 'pattern', emitterId, patternId: p.id })}
          className={`min-w-0 flex-1 truncate text-left text-[11px] ${
            selected ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--text)]'
          } ${p.enabled ? '' : 'opacity-40'}`}
          title={p.name}
        >
          {p.name}
        </button>
        <button
          title="有効 / 無効"
          onClick={() => s().updatePattern(emitterId, p.id, { enabled: !p.enabled })}
          className="shrink-0 text-[var(--muted)] hover:text-[var(--text)]"
        >
          {Icon.eye(p.enabled)}
        </button>
      </div>

      <div
        className="relative shrink-0 border-b border-[var(--border)]"
        style={{ width: laneW, height: ROW_H }}
      >
        <Gridlines duration={duration} pxPerFrame={pxPerFrame} />
        <div
          className={`drag-surface group absolute top-[3px] bottom-[3px] cursor-grab overflow-hidden rounded-md active:cursor-grabbing ${
            p.enabled ? '' : 'opacity-40'
          }`}
          style={{
            left: p.startFrame * pxPerFrame,
            width: Math.max(6, span * pxPerFrame),
            background: `${p.color}59`,
            boxShadow: selected ? `inset 0 0 0 1.5px ${p.color}` : `inset 0 0 0 1px ${p.color}99`,
          }}
          onPointerDown={begin('move')}
          onPointerMove={move}
          onPointerUp={end}
          title={`${p.name}  ${p.startFrame}F → ${p.endFrame}F (${(span / FPS).toFixed(2)}s)${
            p.loop ? ' · loop' : ''
          }`}
        >
          {shots
            .filter((_, i) => i % markerStride === 0)
            .map((f, i) => (
              <span
                key={i}
                className="pointer-events-none absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white/85"
                style={{ left: f * pxPerFrame }}
              />
            ))}
          <div
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40"
            onPointerDown={begin('l')}
            onPointerMove={move}
            onPointerUp={end}
          />
          <div
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
            onPointerDown={begin('r')}
            onPointerMove={move}
            onPointerUp={end}
          />
        </div>
      </div>
    </div>
  )
}

function SoundRow({
  sound,
  laneW,
  pxPerFrame,
}: {
  sound: SoundDef
  laneW: number
  pxPerFrame: number
}) {
  const s = useStore.getState
  const selection = useStore((st) => st.selection)
  const selected = selection?.type === 'sound' && selection.soundId === sound.id
  const drag = useRef<{ mode: 'move' | 'l' | 'r'; x: number; a: number; b: number } | null>(null)

  const begin = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation()
    s().select({ type: 'sound', soundId: sound.id })
    drag.current = { mode, x: e.clientX, a: sound.startFrame, b: sound.endFrame }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const delta = Math.round((e.clientX - d.x) / pxPerFrame)
    if (d.mode === 'move')
      s().updateSound(sound.id, { startFrame: d.a + delta, endFrame: d.b + delta })
    else if (d.mode === 'l')
      s().updateSound(sound.id, { startFrame: Math.min(d.b - 1, Math.max(0, d.a + delta)) })
    else s().updateSound(sound.id, { endFrame: Math.max(d.a + 1, d.b + delta) })
  }

  return (
    <div className="flex">
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-b border-[var(--border)] bg-[var(--card)] pr-2 pl-6 text-[11px]"
        style={{ width: HEAD_W, height: ROW_H }}
      >
        <span className="text-[var(--muted)]">♪</span>
        <button
          className={`min-w-0 flex-1 truncate text-left ${
            selected ? 'font-semibold text-[var(--accent-ink)]' : ''
          }`}
          onClick={() => s().select({ type: 'sound', soundId: sound.id })}
        >
          {sound.name}
        </button>
      </div>
      <div
        className="relative shrink-0 border-b border-[var(--border)]"
        style={{ width: laneW, height: ROW_H }}
      >
        <div
          className="drag-surface absolute top-[4px] bottom-[4px] cursor-grab overflow-hidden rounded-md"
          style={{
            left: sound.startFrame * pxPerFrame,
            width: Math.max(6, (sound.endFrame - sound.startFrame) * pxPerFrame),
            background: '#2dd4bf40',
            boxShadow: selected ? 'inset 0 0 0 1.5px #14b8a6' : 'inset 0 0 0 1px #14b8a699',
          }}
          onPointerDown={begin('move')}
          onPointerMove={move}
          onPointerUp={() => (drag.current = null)}
          title={`${sound.name} ${sound.startFrame}F → ${sound.endFrame}F`}
        >
          <div
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40"
            onPointerDown={begin('l')}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
          />
          <div
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
            onPointerDown={begin('r')}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
          />
        </div>
      </div>
    </div>
  )
}

function Ticks({
  duration,
  pxPerFrame,
  unit,
}: {
  duration: number
  pxPerFrame: number
  unit: 'frame' | 'second'
}) {
  const perSecond = FPS * pxPerFrame
  const stepFrames =
    unit === 'second'
      ? perSecond > 90
        ? FPS / 2
        : perSecond > 42
          ? FPS
          : perSecond > 20
            ? FPS * 2
            : FPS * 5
      : pxPerFrame > 4
        ? 30
        : pxPerFrame > 1.5
          ? 60
          : 120

  const ticks: number[] = []
  for (let f = 0; f <= duration; f += stepFrames) ticks.push(f)
  return (
    <>
      {ticks.map((f) => (
        <div
          key={f}
          className="pointer-events-none absolute top-0 h-full"
          style={{ left: f * pxPerFrame }}
        >
          <div className="h-1.5 w-px bg-[var(--border-strong)]" />
          <div className="pl-1 font-mono text-[9.5px] whitespace-nowrap text-[var(--muted)]">
            {unit === 'second' ? `${+(f / FPS).toFixed(2)}s` : `${f}`}
          </div>
        </div>
      ))}
    </>
  )
}

function Gridlines({ duration, pxPerFrame }: { duration: number; pxPerFrame: number }) {
  const step = FPS * (pxPerFrame * FPS > 42 ? 1 : 5)
  const lines: number[] = []
  for (let f = 0; f <= duration; f += step) lines.push(f)
  return (
    <>
      {lines.map((f) => (
        <div
          key={f}
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--border)]"
          style={{ left: f * pxPerFrame }}
        />
      ))}
    </>
  )
}

function KeyDot({
  left,
  title,
  onDrag,
  onAltClick,
}: {
  left: number
  title: string
  onDrag: (clientX: number) => void
  onAltClick: () => void
}) {
  const dragging = useRef(false)
  return (
    <div
      title={`${title} — Alt+クリックで削除`}
      className="drag-surface absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize border border-[#f5a524] bg-[#fff4dc] hover:bg-[#f5a524]"
      style={{ left }}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.altKey) {
          onAltClick()
          return
        }
        dragging.current = true
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => dragging.current && onDrag(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
    />
  )
}
