import { create } from 'zustand'
import {
  findEmitter,
  findPattern,
  findSound,
  sortKeys,
  type EmitterDef,
  type Keyframe,
  type Modifier,
  type ModifierType,
  type Pattern,
  type PatternType,
  type Project,
  type SoundDef,
} from '../types/dmk'
import { createProject } from '../samples'
import {
  defaultEmitter,
  defaultModifier,
  defaultPattern,
  defaultSound,
  uid,
} from '../types/factory'

export type Selection =
  | { type: 'emitter'; emitterId: string }
  | { type: 'pattern'; emitterId: string; patternId: string }
  | { type: 'sound'; soundId: string }
  | { type: 'project' }
  | null

export type PlayRate = 0.25 | 0.5 | 1 | 2 | 4
export type PreviewTool = 'pan' | 'select' | 'move' | 'zoomIn' | 'zoomOut'
export type TimeUnit = 'frame' | 'second'
export type ExportTab = 'script' | 'json' | 'csv' | 'gif'
export type MobileTab = 'timeline' | 'objects' | 'library' | 'properties' | 'export'

const HISTORY_LIMIT = 60

interface StoreState {
  project: Project
  /** bumped on every structural edit — the simulator listens to this */
  revision: number
  past: Project[]
  future: Project[]

  frame: number
  playing: boolean
  reverse: boolean
  rate: PlayRate
  loopPlayback: boolean

  selection: Selection
  theme: 'light' | 'dark'
  tool: PreviewTool
  showGrid: boolean
  showHitbox: boolean
  showTrails: boolean
  timeUnit: TimeUnit
  exportTab: ExportTab

  bulletCount: number
  emitterCount: number
  fps: number
  seekMs: number
  cursor: { x: number; y: number }
  sampleSeconds: number
  showSettings: boolean
  showSamples: boolean
  /** which panel the narrow layout shows under the preview */
  mobileTab: MobileTab

  // --- infrastructure -------------------------------------------------------
  mutate: (fn: (p: Project) => void) => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // --- transport ------------------------------------------------------------
  setFrame: (f: number) => void
  nudgeFrame: (d: number) => void
  setPlaying: (v: boolean) => void
  setReverse: (v: boolean) => void
  setRate: (r: PlayRate) => void
  setLoopPlayback: (v: boolean) => void

  // --- view -----------------------------------------------------------------
  select: (s: Selection) => void
  setTheme: (t: 'light' | 'dark') => void
  toggleTheme: () => void
  setTool: (t: PreviewTool) => void
  setShowGrid: (v: boolean) => void
  setShowHitbox: (v: boolean) => void
  setShowTrails: (v: boolean) => void
  setTimeUnit: (u: TimeUnit) => void
  setExportTab: (t: ExportTab) => void
  setStats: (bullets: number, emitters: number, fps: number, seekMs: number) => void
  setCursor: (x: number, y: number) => void
  setSampleSeconds: (v: number) => void
  setShowSettings: (v: boolean) => void
  setShowSamples: (v: boolean) => void
  setMobileTab: (t: MobileTab) => void

  // --- emitters -------------------------------------------------------------
  addEmitter: () => void
  updateEmitter: (emitterId: string, patch: Partial<EmitterDef>) => void
  /** Drag in the preview: writes a keyframe when the channel is animated. */
  moveEmitterTo: (emitterId: string, x: number, y: number, frame: number) => void
  duplicateEmitter: (emitterId: string) => void
  removeEmitter: (emitterId: string) => void
  moveEmitter: (emitterId: string, dir: -1 | 1) => void
  toggleEmitterVisible: (emitterId: string) => void
  toggleEmitterCollapsed: (emitterId: string) => void

  // --- patterns -------------------------------------------------------------
  addPattern: (emitterId: string, type: PatternType, startFrame?: number) => void
  updatePattern: (emitterId: string, patternId: string, patch: Partial<Pattern>) => void
  duplicatePattern: (emitterId: string, patternId: string) => void
  removePattern: (emitterId: string, patternId: string) => void
  movePattern: (emitterId: string, patternId: string, dir: -1 | 1) => void

  // --- modifiers ------------------------------------------------------------
  addModifier: (emitterId: string, patternId: string, type: ModifierType) => void
  updateModifier: (
    emitterId: string,
    patternId: string,
    modifierId: string,
    patch: Partial<Modifier>,
  ) => void
  removeModifier: (emitterId: string, patternId: string, modifierId: string) => void

  // --- keyframes ------------------------------------------------------------
  setKeyframe: (emitterId: string, channel: keyof EmitterDef['keys'], frame: number) => void
  updateKeyframe: (
    emitterId: string,
    channel: keyof EmitterDef['keys'],
    keyId: string,
    patch: Partial<Keyframe>,
  ) => void
  removeKeyframe: (emitterId: string, channel: keyof EmitterDef['keys'], keyId: string) => void

  // --- sounds ---------------------------------------------------------------
  addSound: (startFrame: number) => void
  updateSound: (soundId: string, patch: Partial<SoundDef>) => void
  removeSound: (soundId: string) => void

  // --- project --------------------------------------------------------------
  loadProject: (p: Project) => void
  newProject: () => void
  deleteSelection: () => void
  duplicateSelection: () => void
}

const clampFrame = (p: Project, f: number) =>
  Math.max(0, Math.min(p.settings.duration, Math.round(f)))

export const useStore = create<StoreState>((set, get) => ({
  project: createProject(),
  revision: 0,
  past: [],
  future: [],

  frame: 0,
  playing: false,
  reverse: false,
  rate: 1,
  loopPlayback: true,

  selection: null,
  theme: 'light',
  tool: 'pan',
  showGrid: true,
  showHitbox: true,
  showTrails: false,
  timeUnit: 'second',
  exportTab: 'script',

  bulletCount: 0,
  emitterCount: 0,
  fps: 60,
  seekMs: 0,
  cursor: { x: 0, y: 0 },
  sampleSeconds: 5.2,
  showSettings: false,
  showSamples: false,
  mobileTab: 'timeline',

  // -------------------------------------------------------------------------
  mutate: (fn) =>
    set((s) => {
      const next = structuredClone(s.project) as Project
      fn(next)
      const past = [...s.past, s.project]
      if (past.length > HISTORY_LIMIT) past.shift()
      return { project: next, past, future: [], revision: s.revision + 1 }
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {}
      const prev = s.past[s.past.length - 1]
      return {
        project: prev,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future].slice(0, HISTORY_LIMIT),
        revision: s.revision + 1,
      }
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {}
      const next = s.future[0]
      return {
        project: next,
        past: [...s.past, s.project].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        revision: s.revision + 1,
      }
    }),
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // -------------------------------------------------------------------------
  setFrame: (f) => set((s) => ({ frame: clampFrame(s.project, f) })),
  nudgeFrame: (d) => set((s) => ({ frame: clampFrame(s.project, s.frame + d) })),
  setPlaying: (v) => set({ playing: v }),
  setReverse: (v) => set({ reverse: v }),
  setRate: (r) => set({ rate: r }),
  setLoopPlayback: (v) => set({ loopPlayback: v }),

  select: (selection) => set({ selection }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setTool: (tool) => set({ tool }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setShowHitbox: (showHitbox) => set({ showHitbox }),
  setShowTrails: (showTrails) => set({ showTrails }),
  setTimeUnit: (timeUnit) => set({ timeUnit }),
  setExportTab: (exportTab) => set({ exportTab }),
  setStats: (bulletCount, emitterCount, fps, seekMs) =>
    set({ bulletCount, emitterCount, fps, seekMs }),
  setCursor: (x, y) => set({ cursor: { x, y } }),
  setSampleSeconds: (sampleSeconds) => set({ sampleSeconds }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowSamples: (showSamples) => set({ showSamples }),
  setMobileTab: (mobileTab) => set({ mobileTab }),

  // -------------------------------------------------------------------------
  addEmitter: () => {
    const id = uid('emt')
    get().mutate((p) => {
      const e = defaultEmitter(`Emitter ${p.emitters.length + 1}`, 0, -100)
      e.id = id
      p.emitters.push(e)
    })
    set({ selection: { type: 'emitter', emitterId: id } })
  },
  updateEmitter: (emitterId, patch) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (e) Object.assign(e, patch)
    }),
  moveEmitterTo: (emitterId, x, y, frame) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (!e) return
      const write = (channel: 'x' | 'y', value: number) => {
        const list = e.keys[channel]
        if (list.length === 0) {
          e[channel] = value
          return
        }
        const existing = list.find((k) => k.frame === frame)
        if (existing) existing.value = value
        else list.push({ id: uid('kf'), frame, value, ease: 'easeInOut' })
        e.keys[channel] = sortKeys(list)
      }
      write('x', x)
      write('y', y)
    }),
  duplicateEmitter: (emitterId) => {
    const id = uid('emt')
    get().mutate((p) => {
      const i = p.emitters.findIndex((e) => e.id === emitterId)
      if (i < 0) return
      const copy = structuredClone(p.emitters[i])
      copy.id = id
      copy.name = `${copy.name} copy`
      copy.patterns = copy.patterns.map((pt) => ({
        ...pt,
        id: uid('pat'),
        modifiers: pt.modifiers.map((m) => ({ ...m, id: uid('mod') })),
      }))
      copy.keys = {
        x: copy.keys.x.map((k) => ({ ...k, id: uid('kf') })),
        y: copy.keys.y.map((k) => ({ ...k, id: uid('kf') })),
        rotation: copy.keys.rotation.map((k) => ({ ...k, id: uid('kf') })),
      }
      p.emitters.splice(i + 1, 0, copy)
    })
    set({ selection: { type: 'emitter', emitterId: id } })
  },
  removeEmitter: (emitterId) => {
    get().mutate((p) => {
      p.emitters = p.emitters.filter((e) => e.id !== emitterId)
    })
    set({ selection: null })
  },
  moveEmitter: (emitterId, dir) =>
    get().mutate((p) => {
      const i = p.emitters.findIndex((e) => e.id === emitterId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= p.emitters.length) return
      ;[p.emitters[i], p.emitters[j]] = [p.emitters[j], p.emitters[i]]
    }),
  toggleEmitterVisible: (emitterId) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (e) e.visible = !e.visible
    }),
  toggleEmitterCollapsed: (emitterId) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (e) e.collapsed = !e.collapsed
    }),

  // -------------------------------------------------------------------------
  addPattern: (emitterId, type, startFrame) => {
    const id = uid('pat')
    const start = startFrame ?? get().frame
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (!e) return
      const pat = defaultPattern(type, start, e.patterns.length + p.emitters.indexOf(e))
      pat.id = id
      pat.endFrame = Math.min(p.settings.duration, start + 300)
      if (pat.endFrame <= pat.startFrame) pat.endFrame = pat.startFrame + 60
      e.patterns.push(pat)
    })
    set({ selection: { type: 'pattern', emitterId, patternId: id } })
  },
  updatePattern: (emitterId, patternId, patch) =>
    get().mutate((p) => {
      const pat = findPattern(p, emitterId, patternId)
      if (!pat) return
      Object.assign(pat, patch)
      if (pat.startFrame < 0) {
        pat.endFrame -= pat.startFrame
        pat.startFrame = 0
      }
      if (pat.endFrame <= pat.startFrame) pat.endFrame = pat.startFrame + 1
    }),
  duplicatePattern: (emitterId, patternId) => {
    const id = uid('pat')
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      const i = e?.patterns.findIndex((x) => x.id === patternId) ?? -1
      if (!e || i < 0) return
      const copy = structuredClone(e.patterns[i])
      copy.id = id
      copy.name = `${copy.name} copy`
      copy.modifiers = copy.modifiers.map((m) => ({ ...m, id: uid('mod') }))
      const len = copy.endFrame - copy.startFrame
      copy.startFrame = copy.endFrame
      copy.endFrame = copy.startFrame + len
      e.patterns.splice(i + 1, 0, copy)
    })
    set({ selection: { type: 'pattern', emitterId, patternId: id } })
  },
  removePattern: (emitterId, patternId) => {
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (e) e.patterns = e.patterns.filter((x) => x.id !== patternId)
    })
    set({ selection: { type: 'emitter', emitterId } })
  },
  movePattern: (emitterId, patternId, dir) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (!e) return
      const i = e.patterns.findIndex((x) => x.id === patternId)
      const j = i + dir
      if (i < 0 || j < 0 || j >= e.patterns.length) return
      ;[e.patterns[i], e.patterns[j]] = [e.patterns[j], e.patterns[i]]
    }),

  // -------------------------------------------------------------------------
  addModifier: (emitterId, patternId, type) =>
    get().mutate((p) => {
      const pat = findPattern(p, emitterId, patternId)
      if (pat && pat.modifiers.length < 30) pat.modifiers.push(defaultModifier(type))
    }),
  updateModifier: (emitterId, patternId, modifierId, patch) =>
    get().mutate((p) => {
      const mod = findPattern(p, emitterId, patternId)?.modifiers.find((m) => m.id === modifierId)
      if (mod) Object.assign(mod, patch)
    }),
  removeModifier: (emitterId, patternId, modifierId) =>
    get().mutate((p) => {
      const pat = findPattern(p, emitterId, patternId)
      if (pat) pat.modifiers = pat.modifiers.filter((m) => m.id !== modifierId)
    }),

  // -------------------------------------------------------------------------
  setKeyframe: (emitterId, channel, frame) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (!e) return
      const list = e.keys[channel]
      const fallback = channel === 'x' ? e.x : channel === 'y' ? e.y : e.rotation
      const value = list.length > 0 ? lerpAt(list, frame, fallback) : fallback
      const existing = list.find((k) => k.frame === frame)
      if (existing) existing.value = value
      else list.push({ id: uid('kf'), frame, value, ease: 'easeInOut' })
      e.keys[channel] = sortKeys(list)
    }),
  updateKeyframe: (emitterId, channel, keyId, patch) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (!e) return
      const k = e.keys[channel].find((x) => x.id === keyId)
      if (k) Object.assign(k, patch)
      e.keys[channel] = sortKeys(e.keys[channel])
    }),
  removeKeyframe: (emitterId, channel, keyId) =>
    get().mutate((p) => {
      const e = findEmitter(p, emitterId)
      if (e) e.keys[channel] = e.keys[channel].filter((x) => x.id !== keyId)
    }),

  // -------------------------------------------------------------------------
  addSound: (startFrame) => {
    const id = uid('snd')
    get().mutate((p) => {
      const s = defaultSound(`Sound ${p.sounds.length + 1}`, startFrame)
      s.id = id
      p.sounds.push(s)
    })
    set({ selection: { type: 'sound', soundId: id } })
  },
  updateSound: (soundId, patch) =>
    get().mutate((p) => {
      const s = findSound(p, soundId)
      if (!s) return
      Object.assign(s, patch)
      if (s.startFrame < 0) s.startFrame = 0
      if (s.endFrame <= s.startFrame) s.endFrame = s.startFrame + 1
    }),
  removeSound: (soundId) => {
    get().mutate((p) => {
      p.sounds = p.sounds.filter((s) => s.id !== soundId)
    })
    set({ selection: null })
  },

  // -------------------------------------------------------------------------
  loadProject: (p) =>
    set((s) => ({
      project: p,
      past: [...s.past, s.project].slice(-HISTORY_LIMIT),
      future: [],
      revision: s.revision + 1,
      frame: 0,
      playing: false,
      selection: null,
    })),
  newProject: () =>
    set((s) => ({
      project: createProject(),
      past: [...s.past, s.project].slice(-HISTORY_LIMIT),
      future: [],
      revision: s.revision + 1,
      frame: 0,
      playing: false,
      selection: null,
    })),

  deleteSelection: () => {
    const s = get()
    const sel = s.selection
    if (!sel) return
    if (sel.type === 'pattern') s.removePattern(sel.emitterId, sel.patternId)
    else if (sel.type === 'emitter') s.removeEmitter(sel.emitterId)
    else if (sel.type === 'sound') s.removeSound(sel.soundId)
  },
  duplicateSelection: () => {
    const s = get()
    const sel = s.selection
    if (!sel) return
    if (sel.type === 'pattern') s.duplicatePattern(sel.emitterId, sel.patternId)
    else if (sel.type === 'emitter') s.duplicateEmitter(sel.emitterId)
  },
}))

function lerpAt(keys: Keyframe[], frame: number, fallback: number): number {
  if (keys.length === 0) return fallback
  const sorted = sortKeys(keys)
  if (frame <= sorted[0].frame) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (frame >= last.frame) return last.value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (frame >= a.frame && frame <= b.frame) {
      const span = b.frame - a.frame || 1
      return a.value + (b.value - a.value) * ((frame - a.frame) / span)
    }
  }
  return last.value
}
