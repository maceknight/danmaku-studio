import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Card, IconBtn } from './widgets'
import { Icon } from './icons'

/**
 * Stage ▸ Emitter (folder) ▸ Pattern (leaf) — the same hierarchy the timeline
 * groups by. Selection is shared with the timeline and the property panel.
 */
export function ObjectPanel() {
  const project = useStore((s) => s.project)
  const selection = useStore((s) => s.selection)
  const [query, setQuery] = useState('')
  const [onlyVisible, setOnlyVisible] = useState(false)
  const s = useStore.getState

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return project.emitters
      .filter((e) => !onlyVisible || e.visible)
      .map((e) => ({
        emitter: e,
        patterns: e.patterns.filter(
          (p) => !q || p.name.toLowerCase().includes(q) || e.name.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => !q || g.patterns.length > 0 || g.emitter.name.toLowerCase().includes(q))
  }, [project.emitters, query, onlyVisible])

  const selEmitterId =
    selection?.type === 'emitter' || selection?.type === 'pattern' ? selection.emitterId : null

  return (
    <Card
      index={1}
      title="オブジェクト"
      right={
        <IconBtn title="エミッターを追加" size={24} onClick={() => s().addEmitter()}>
          <Icon.plus />
        </IconBtn>
      }
      bodyClassName="flex flex-col"
    >
      {/* search */}
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--muted)]">
            <Icon.search />
          </span>
          <input
            type="text"
            value={query}
            placeholder="検索..."
            onChange={(e) => setQuery(e.target.value)}
            className="!pl-8"
          />
        </div>
        <IconBtn
          title="表示中のみ"
          size={28}
          active={onlyVisible}
          onClick={() => setOnlyVisible(!onlyVisible)}
        >
          <Icon.filter />
        </IconBtn>
      </div>

      {/* tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 text-[12px]">
        <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[var(--text-2)]">
          <span className="text-[10px]">▾</span>
          <span className="text-[var(--muted)]">
            <Icon.folder />
          </span>
          <button onClick={() => s().select({ type: 'project' })} className="flex-1 text-left">
            Stage
          </button>
        </div>

        {filtered.map(({ emitter: e, patterns }) => {
          const selected = selection?.type === 'emitter' && selection.emitterId === e.id
          return (
            <div key={e.id}>
              <div
                className={`group flex items-center gap-1.5 rounded-lg py-1.5 pr-1 pl-4 ${
                  selected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]'
                }`}
              >
                <button
                  className="w-3 shrink-0 text-[10px] text-[var(--muted)]"
                  onClick={() => s().toggleEmitterCollapsed(e.id)}
                >
                  {e.collapsed ? '▸' : '▾'}
                </button>
                <span className="shrink-0 text-[var(--muted)]">
                  <Icon.folder />
                </span>
                <button
                  onClick={() => s().select({ type: 'emitter', emitterId: e.id })}
                  className={`min-w-0 flex-1 truncate text-left ${
                    selected ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--text)]'
                  } ${e.visible ? '' : 'opacity-40'}`}
                  title={e.name}
                >
                  {e.name}
                </button>
                <button
                  title="表示 / 非表示"
                  onClick={() => s().toggleEmitterVisible(e.id)}
                  className="shrink-0 px-1 text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {Icon.eye(e.visible)}
                </button>
              </div>

              {!e.collapsed &&
                patterns.map((p) => {
                  const psel =
                    selection?.type === 'pattern' &&
                    selection.patternId === p.id &&
                    selection.emitterId === e.id
                  return (
                    <div
                      key={p.id}
                      className={`group flex items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-9 ${
                        psel ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--hover)]'
                      }`}
                    >
                      <span className="shrink-0 text-[var(--muted)]">{Icon.eye(p.enabled)}</span>
                      <button
                        onClick={() =>
                          s().select({ type: 'pattern', emitterId: e.id, patternId: p.id })
                        }
                        className={`min-w-0 flex-1 truncate text-left ${
                          psel ? 'font-semibold text-[var(--accent-ink)]' : 'text-[var(--text)]'
                        } ${p.enabled ? '' : 'opacity-40'}`}
                        title={`${p.name} (${p.type})`}
                      >
                        {p.name}
                      </button>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: p.color }}
                      />
                    </div>
                  )
                })}
            </div>
          )
        })}

        {project.sounds.length > 0 && (
          <div className="mt-1 border-t border-[var(--border)] pt-1">
            {project.sounds.map((snd) => (
              <div
                key={snd.id}
                className={`flex items-center gap-1.5 rounded-lg py-1.5 pr-2 pl-4 ${
                  selection?.type === 'sound' && selection.soundId === snd.id
                    ? 'bg-[var(--accent-soft)]'
                    : 'hover:bg-[var(--hover)]'
                }`}
              >
                <span className="text-[var(--muted)]">♪</span>
                <button
                  onClick={() => s().select({ type: 'sound', soundId: snd.id })}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {snd.name}
                </button>
                {!snd.src && <span className="text-[10px] text-[var(--muted)]">未読込</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* footer actions */}
      <div className="flex shrink-0 items-center gap-1 border-t border-[var(--border)] px-2 py-2">
        <IconBtn title="エミッターを追加" onClick={() => s().addEmitter()}>
          <Icon.folderPlus />
        </IconBtn>
        <IconBtn
          title="複製"
          disabled={!selection || selection.type === 'project' || selection.type === 'sound'}
          onClick={() => s().duplicateSelection()}
        >
          <Icon.copy />
        </IconBtn>
        <IconBtn title="音声を追加" onClick={() => s().addSound(s().frame)}>
          <span className="text-[13px]">♪</span>
        </IconBtn>
        <IconBtn
          title="削除"
          disabled={!selection || selection.type === 'project'}
          onClick={() => s().deleteSelection()}
        >
          <Icon.trash />
        </IconBtn>
        <div className="flex-1" />
        <IconBtn
          title="上へ"
          disabled={!selEmitterId}
          onClick={() => {
            if (!selection) return
            if (selection.type === 'pattern')
              s().movePattern(selection.emitterId, selection.patternId, -1)
            else if (selection.type === 'emitter') s().moveEmitter(selection.emitterId, -1)
          }}
        >
          <Icon.arrowUp />
        </IconBtn>
        <IconBtn
          title="下へ"
          disabled={!selEmitterId}
          onClick={() => {
            if (!selection) return
            if (selection.type === 'pattern')
              s().movePattern(selection.emitterId, selection.patternId, 1)
            else if (selection.type === 'emitter') s().moveEmitter(selection.emitterId, 1)
          }}
        >
          <Icon.arrowDown />
        </IconBtn>
      </div>
    </Card>
  )
}
