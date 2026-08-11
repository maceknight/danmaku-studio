import { audioEngine } from '../audio/engine'
import { useStore } from '../store/useStore'
import {
  FPS,
  findEmitter,
  findPattern,
  findSound,
  type BlendMode,
  type EmitterDef,
  type ModifierType,
  type Pattern,
  type PatternType,
} from '../types/dmk'
import { BULLET_PRESETS, PATTERN_LABELS, PATTERN_LIBRARY } from '../types/factory'
import { colorOf } from '../io/shotData'
import { SHAPE_ORDER, SHAPES, suggestShotDataId } from '../types/shapes'
import { ShapeGlyph } from './icons'
import { ShotPicker } from './ShotPicker'
import { Btn, Card, Field, Group, NumField, Select } from './widgets'

const PATTERN_OPTIONS = PATTERN_LIBRARY.map((t) => ({ value: t, label: PATTERN_LABELS[t] }))

const MODIFIER_TYPES: ModifierType[] = [
  'rotate',
  'gravity',
  'accel',
  'split',
  'fade',
  'scale',
  'random',
  'graphic',
  'reaim',
  'destroy',
  'wait',
]

const MODIFIER_LABELS: Record<ModifierType, string> = {
  rotate: '回転',
  gravity: '重力',
  accel: '加速',
  split: '分裂',
  fade: 'フェード',
  scale: '拡縮',
  random: 'ランダム',
  graphic: '弾を変える',
  reaim: '自機へ再照準',
  destroy: '消滅',
  wait: '待機',
}

const AMOUNT_LABELS: Record<ModifierType, [string, string | null]> = {
  rotate: ['度/F', null],
  gravity: ['重力Y', '重力X'],
  accel: ['加速度', null],
  split: ['分裂数', '拡がり°'],
  fade: ['目標α', null],
  scale: ['目標倍率', null],
  random: ['速度±', '角度±°'],
  graphic: ['—', null],
  reaim: ['—', null],
  destroy: ['—', null],
  wait: ['—', null],
}

/** Modifiers whose only meaningful input is the frame it fires on. */
const TIME_ONLY: ModifierType[] = ['graphic', 'reaim', 'destroy']

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'alpha', label: '通常' },
  { value: 'add', label: '加算' },
  { value: 'multiply', label: '乗算' },
]

export function Properties() {
  const selection = useStore((s) => s.selection)
  const project = useStore((s) => s.project)

  let subtitle = 'プロジェクト'
  let title = project.name
  let dot: string | null = null
  if (selection?.type === 'emitter') {
    subtitle = 'エミッター'
    title = findEmitter(project, selection.emitterId)?.name ?? ''
  } else if (selection?.type === 'pattern') {
    const p = findPattern(project, selection.emitterId, selection.patternId)
    subtitle = 'パターン'
    title = p?.name ?? ''
    dot = p?.color ?? null
  } else if (selection?.type === 'sound') {
    subtitle = '音声'
    title = findSound(project, selection.soundId)?.name ?? ''
  }

  return (
    <Card index={4} title="プロパティ" bodyClassName="overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className="truncate text-[13px] font-semibold text-[var(--accent-ink)]">{title}</span>
        {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="ml-auto shrink-0 text-[11px] text-[var(--muted)]">{subtitle}</span>
      </div>

      {(!selection || selection.type === 'project') && <ProjectProps />}
      {selection?.type === 'emitter' && <EmitterProps emitterId={selection.emitterId} />}
      {selection?.type === 'pattern' && (
        <PatternProps emitterId={selection.emitterId} patternId={selection.patternId} />
      )}
      {selection?.type === 'sound' && <SoundProps soundId={selection.soundId} />}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function ProjectProps() {
  const p = useStore((s) => s.project)
  const mutate = useStore((s) => s.mutate)
  const st = p.settings
  return (
    <>
      <Group title="基本設定">
        <Field label="プロジェクト名">
          <input
            type="text"
            value={p.name}
            onChange={(e) => mutate((d) => void (d.name = e.target.value))}
          />
        </Field>
        <Field label="全体の長さ">
          <NumField
            value={st.duration / FPS}
            step={1}
            min={1}
            suffix="s"
            onChange={(v) => mutate((d) => void (d.settings.duration = Math.round(v * FPS)))}
          />
        </Field>
        <Field label="乱数シード">
          <NumField
            value={st.seed}
            onChange={(v) => mutate((d) => void (d.settings.seed = Math.round(v)))}
          />
        </Field>
      </Group>
      <Group title="ステージ">
        <Field label="幅">
          <NumField
            value={st.stageWidth}
            min={64}
            onChange={(v) => mutate((d) => void (d.settings.stageWidth = Math.round(v)))}
          />
        </Field>
        <Field label="高さ">
          <NumField
            value={st.stageHeight}
            min={64}
            onChange={(v) => mutate((d) => void (d.settings.stageHeight = Math.round(v)))}
          />
        </Field>
        <Field label="自機 X">
          <NumField value={st.playerX} onChange={(v) => mutate((d) => void (d.settings.playerX = v))} />
        </Field>
        <Field label="自機 Y">
          <NumField value={st.playerY} onChange={(v) => mutate((d) => void (d.settings.playerY = v))} />
        </Field>
      </Group>
      <Group title="ボス (出力用)">
        <Field label="名前">
          <input
            type="text"
            value={st.bossName}
            onChange={(e) => mutate((d) => void (d.settings.bossName = e.target.value))}
          />
        </Field>
        <Field label="体力">
          <NumField
            value={st.bossLife}
            step={100}
            onChange={(v) => mutate((d) => void (d.settings.bossLife = Math.round(v)))}
          />
        </Field>
      </Group>
    </>
  )
}

// ---------------------------------------------------------------------------

const CHANNELS: { key: keyof EmitterDef['keys']; label: string; prop: 'x' | 'y' | 'rotation' }[] = [
  { key: 'x', label: '位置 X', prop: 'x' },
  { key: 'y', label: '位置 Y', prop: 'y' },
  { key: 'rotation', label: '回転', prop: 'rotation' },
]

function EmitterProps({ emitterId }: { emitterId: string }) {
  const emitter = useStore((s) => findEmitter(s.project, emitterId))
  const frame = useStore((s) => s.frame)
  const s = useStore.getState
  if (!emitter) return null

  return (
    <>
      <Group title="基本設定">
        <Field label="名前">
          <input
            type="text"
            value={emitter.name}
            onChange={(e) => s().updateEmitter(emitterId, { name: e.target.value })}
          />
        </Field>
        <Field label="表示">
          <Select
            value={emitter.visible ? 'on' : 'off'}
            options={[
              { value: 'on', label: '表示する' },
              { value: 'off', label: '非表示' },
            ]}
            onChange={(v) => s().updateEmitter(emitterId, { visible: v === 'on' })}
          />
        </Field>
        <Field label="パターン数">
          <div className="text-[12px] text-[var(--text-2)]">{emitter.patterns.length}</div>
        </Field>
      </Group>

      <Group title="トランスフォーム / キーフレーム">
        {CHANNELS.map((ch) => {
          const keys = emitter.keys[ch.key]
          return (
            <div key={ch.key} className="rounded-lg border border-[var(--border)] p-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  title={keys.length ? '再生ヘッド位置にキーを追加' : 'このチャンネルをアニメート'}
                  onClick={() => s().setKeyframe(emitterId, ch.key, frame)}
                  className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[8px] ${
                    keys.length
                      ? 'border-[#f5a524] bg-[#f5a524] text-white'
                      : 'border-[var(--border-strong)] text-[var(--muted)]'
                  }`}
                >
                  ◆
                </button>
                <span className="flex-1 text-[11.5px] text-[var(--text-2)]">{ch.label}</span>
                <div className="w-[86px]">
                  <NumField
                    value={emitter[ch.prop]}
                    onChange={(v) =>
                      s().updateEmitter(emitterId, { [ch.prop]: v } as Partial<EmitterDef>)
                    }
                  />
                </div>
              </div>
              {keys.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {keys.map((k) => (
                    <div key={k.id} className="flex items-center gap-1">
                      <span className="w-[46px] shrink-0 text-right font-mono text-[10px] text-[var(--muted)]">
                        {(k.frame / FPS).toFixed(2)}s
                      </span>
                      <div className="w-[62px]">
                        <NumField
                          value={k.value}
                          onChange={(v) => s().updateKeyframe(emitterId, ch.key, k.id, { value: v })}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <Select
                          value={k.ease}
                          options={[
                            { value: 'linear', label: 'リニア' },
                            { value: 'easeIn', label: 'イーズイン' },
                            { value: 'easeOut', label: 'イーズアウト' },
                            { value: 'easeInOut', label: 'イーズ両方' },
                            { value: 'hold', label: 'ホールド' },
                          ]}
                          onChange={(v) => s().updateKeyframe(emitterId, ch.key, k.id, { ease: v })}
                        />
                      </div>
                      <button
                        className="shrink-0 px-1 text-[var(--muted)] hover:text-[#e05260]"
                        onClick={() => s().removeKeyframe(emitterId, ch.key, k.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
          キーフレームは絶対フレーム。出力時は{' '}
          <code className="text-[var(--text-2)]">ObjMove_SetDestAtFrame</code> になります。
        </p>
      </Group>

      <Group title="パターン">
        <div className="space-y-1">
          {emitter.patterns.map((p) => (
            <button
              key={p.id}
              onClick={() => s().select({ type: 'pattern', emitterId, patternId: p.id })}
              className="flex w-full items-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-1.5 text-left text-[11.5px] hover:bg-[var(--hover)]"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-[var(--muted)]">
                {(p.startFrame / FPS).toFixed(1)}–{(p.endFrame / FPS).toFixed(1)}s
              </span>
            </button>
          ))}
        </div>
        <Select
          value={''}
          options={[
            { value: '', label: '+ パターンを追加…' },
            ...PATTERN_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
          ]}
          onChange={(v) => v && s().addPattern(emitterId, v as PatternType, frame)}
        />
      </Group>
    </>
  )
}

// ---------------------------------------------------------------------------

function PatternProps({ emitterId, patternId }: { emitterId: string; patternId: string }) {
  const p = useStore((st) => findPattern(st.project, emitterId, patternId))
  const sampleSeconds = useStore((st) => st.sampleSeconds)
  const hasSheet = useStore((st) => st.shotFamilies.length > 0)
  const s = useStore.getState
  if (!p) return null

  const set = (patch: Partial<Pattern>) => s().updatePattern(emitterId, patternId, patch)
  const setBullet = (patch: Partial<typeof p.bullet>) => set({ bullet: { ...p.bullet, ...patch } })
  const len = p.endFrame - p.startFrame

  return (
    <>
      <Group title="基本設定">
        <Field label="名前">
          <input type="text" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="開始時間">
          <NumField
            value={p.startFrame / FPS}
            step={0.1}
            min={0}
            suffix="s"
            onChange={(v) =>
              set({ startFrame: Math.round(v * FPS), endFrame: Math.round(v * FPS) + len })
            }
          />
        </Field>
        <Field label="継続時間">
          <NumField
            value={len / FPS}
            step={0.1}
            min={0.02}
            suffix="s"
            onChange={(v) => set({ endFrame: p.startFrame + Math.max(1, Math.round(v * FPS)) })}
          />
        </Field>
        <Field label="ループ">
          <Select
            value={p.loop ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'ループしない' },
              { value: 'on', label: 'ループする' },
            ]}
            onChange={(v) => set({ loop: v === 'on' })}
          />
        </Field>
        {p.loop && (
          <Field label="ループ周期">
            <NumField
              value={p.loopInterval}
              min={0}
              suffix="F"
              onChange={(v) => set({ loopInterval: Math.round(v) })}
            />
          </Field>
        )}
        <Field label="優先度">
          <NumField value={p.priority} onChange={(v) => set({ priority: Math.round(v) })} />
        </Field>
      </Group>

      <Group title={`パターン設定 (${PATTERN_LABELS[p.type]})`}>
        <Field label="種類">
          <Select value={p.type} options={PATTERN_OPTIONS} onChange={(v) => set({ type: v })} />
        </Field>
        <Field label="弾数">
          <NumField value={p.count} min={1} max={512} onChange={(v) => set({ count: Math.round(v) })} />
        </Field>
        <Field label="スパイラル角度">
          <NumField value={p.angleStep} step={0.5} suffix="°" onChange={(v) => set({ angleStep: v })} />
        </Field>
        <Field label="半径">
          <NumField value={p.radius} onChange={(v) => set({ radius: v })} />
        </Field>
        <Field label="回転方向">
          <Select
            value={p.spinDirection === 1 ? 'cw' : 'ccw'}
            options={[
              { value: 'cw', label: '右回り' },
              { value: 'ccw', label: '左回り' },
            ]}
            onChange={(v) => set({ spinDirection: v === 'cw' ? 1 : -1 })}
          />
        </Field>
        <Field label="ランダム">
          <NumField
            value={p.angleRandom}
            step={0.5}
            min={0}
            suffix="°"
            onChange={(v) => set({ angleRandom: v })}
          />
        </Field>
        <Field label="基準角度">
          <NumField value={p.angleBase} suffix="°" onChange={(v) => set({ angleBase: v })} />
        </Field>
        <Field label="拡がり角">
          <NumField value={p.angleSpread} suffix="°" onChange={(v) => set({ angleSpread: v })} />
        </Field>
        {p.type === 'oval' && (
          <>
            <Field label="縦横比">
              <NumField
                value={p.ovalRatio}
                step={0.1}
                min={0.1}
                onChange={(v) => set({ ovalRatio: v })}
              />
            </Field>
            <Field label="傾き">
              <NumField value={p.shapeTilt} suffix="°" onChange={(v) => set({ shapeTilt: v })} />
            </Field>
          </>
        )}
        {p.type === 'polygon' && (
          <>
            <Field label="辺の数">
              <NumField
                value={p.polygonSides}
                min={3}
                max={16}
                onChange={(v) => set({ polygonSides: Math.round(v) })}
              />
            </Field>
            <Field label="傾き">
              <NumField value={p.shapeTilt} suffix="°" onChange={(v) => set({ shapeTilt: v })} />
            </Field>
          </>
        )}
        {p.type === 'rose' && (
          <>
            <Field label="花弁の数">
              <NumField
                value={p.rosePetals}
                min={1}
                max={16}
                onChange={(v) => set({ rosePetals: Math.round(v) })}
              />
            </Field>
            <Field label="傾き">
              <NumField value={p.shapeTilt} suffix="°" onChange={(v) => set({ shapeTilt: v })} />
            </Field>
          </>
        )}
        {p.type === 'line' && (
          <Field label="弾の間隔">
            <NumField value={p.lineSpacing} onChange={(v) => set({ lineSpacing: v })} />
          </Field>
        )}
        {p.type === 'whip' && (
          <Field label="速度の増分">
            <NumField value={p.speedStep} step={0.05} onChange={(v) => set({ speedStep: v })} />
          </Field>
        )}
        <Field label="レイヤー数">
          <NumField value={p.layers} min={1} max={16} onChange={(v) => set({ layers: Math.round(v) })} />
        </Field>
        <Field label="レイヤー速度差">
          <NumField value={p.layerSpeedStep} step={0.1} onChange={(v) => set({ layerSpeedStep: v })} />
        </Field>
        <Field label="自機狙い">
          <Select
            value={p.aimPlayer ? 'on' : 'off'}
            options={[
              { value: 'off', label: 'しない' },
              { value: 'on', label: 'する' },
            ]}
            onChange={(v) => set({ aimPlayer: v === 'on' })}
          />
        </Field>
        {p.type === 'laser' && (
          <>
            <Field label="レーザー種別">
              <Select
                value={p.laserType}
                options={[
                  { value: 'straight', label: '固定式（予告線あり）' },
                  { value: 'loose', label: '射出式（まち針）' },
                ]}
                onChange={(v) => set({ laserType: v })}
              />
            </Field>
            <Field label="レーザー長">
              <NumField value={p.laserLength} onChange={(v) => set({ laserLength: v })} />
            </Field>
            <Field label="レーザー幅">
              <NumField value={p.laserWidth} onChange={(v) => set({ laserWidth: v })} />
            </Field>
            {p.laserType === 'straight' ? (
              <>
                <Field label="予告線の長さ">
                  <NumField
                    value={p.laserDelay}
                    min={0}
                    suffix="F"
                    onChange={(v) => set({ laserDelay: Math.round(v) })}
                  />
                </Field>
                <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
                  予告線が {p.laserDelay}F 出たあと実体化し、そこから「寿命{' '}
                  {p.bullet.life}F」続く（合計 {p.laserDelay + p.bullet.life}F）。
                </p>
              </>
            ) : (
              <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
                発射元から伸びながら飛ぶ。速度は「弾 (Bullet)」の速度、伸びきる長さは
                レーザー長。短くして速度を上げると、いわゆるまち針になる。
              </p>
            )}
          </>
        )}
      </Group>

      <Group title="弾 (Bullet)">
        {hasSheet ? (
          <ShotPicker
            value={p.bullet.shotDataId}
            onChange={(shotDataId) => {
              const color = colorOf(shotDataId)
              const preset = color ? BULLET_PRESETS.find((b) => b.name === color) : undefined
              setBullet({
                shotDataId,
                // keep graphic/color in sync so trails and lasers stay on tone
                ...(preset ? { graphic: preset.name, color: preset.color } : {}),
              })
            }}
          />
        ) : (
          <>
            <Field label="弾の種類">
              <div className="grid grid-cols-6 gap-1">
                {SHAPE_ORDER.map((s) => (
                  <button
                    key={s}
                    title={`${SHAPES[s].label} — ${suggestShotDataId(p.bullet.graphic, s)}`}
                    onClick={() =>
                      setBullet({
                        shape: s,
                        shotDataId: suggestShotDataId(p.bullet.graphic, s),
                      })
                    }
                    className={`flex aspect-square items-center justify-center rounded-md border transition-colors ${
                      p.bullet.shape === s
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] hover:bg-[var(--hover)]'
                    }`}
                    style={{ color: p.bullet.color }}
                  >
                    <ShapeGlyph shape={s} size={18} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="色プリセット">
              <Select
                value={p.bullet.graphic}
                options={BULLET_PRESETS.map((b) => ({ value: b.name, label: b.label }))}
                onChange={(v) => {
                  const preset = BULLET_PRESETS.find((b) => b.name === v)
                  if (preset)
                    setBullet({
                      graphic: preset.name,
                      color: preset.color,
                      shotDataId: suggestShotDataId(preset.name, p.bullet.shape),
                    })
                }}
              />
            </Field>
          </>
        )}
        <Field label="ShotDataID">
          <input
            type="text"
            value={p.bullet.shotDataId}
            onChange={(e) => setBullet({ shotDataId: e.target.value })}
          />
        </Field>
        <Field label="速度">
          <NumField value={p.bullet.speed} step={0.1} onChange={(v) => setBullet({ speed: v })} />
        </Field>
        <Field label="加速度">
          <NumField value={p.bullet.accel} step={0.01} onChange={(v) => setBullet({ accel: v })} />
        </Field>
        <Field label="最高速度">
          <NumField value={p.bullet.maxSpeed} step={0.1} onChange={(v) => setBullet({ maxSpeed: v })} />
        </Field>
        <Field label="寿命">
          <NumField
            value={p.bullet.life}
            min={1}
            suffix="F"
            onChange={(v) => setBullet({ life: Math.round(v) })}
          />
        </Field>
        <Field label="サイズ">
          <NumField value={p.bullet.scale} step={0.1} min={0.1} onChange={(v) => setBullet({ scale: v })} />
        </Field>
        <Field label="色">
          <input
            type="color"
            value={p.bullet.color}
            onChange={(e) => setBullet({ color: e.target.value })}
            className="h-[26px] w-full cursor-pointer rounded-md border border-[var(--input-border)] bg-[var(--input)] p-[2px]"
          />
        </Field>
        <Field label="ブレンド">
          <Select value={p.bullet.blend} options={BLENDS} onChange={(v) => setBullet({ blend: v })} />
        </Field>
        <Field label="当たり半径">
          <NumField
            value={p.bullet.hitboxRadius}
            step={0.5}
            min={0.5}
            onChange={(v) => setBullet({ hitboxRadius: v })}
          />
        </Field>
      </Group>

      <Group title="詳細設定">
        <Field label="ランダム角度">
          <NumField
            value={p.angleRandom}
            step={0.5}
            min={0}
            suffix="°"
            onChange={(v) => set({ angleRandom: v })}
          />
        </Field>
        <Field label="ランダム速度">
          <NumField
            value={p.bullet.speedRand}
            step={0.05}
            min={0}
            onChange={(v) => setBullet({ speedRand: v })}
          />
        </Field>
        <Field label="弾間隔">
          <NumField
            value={p.interval}
            min={1}
            suffix="F"
            onChange={(v) => set({ interval: Math.round(v) })}
          />
        </Field>
        <Field label="発射遅延">
          <NumField value={p.offset} min={0} suffix="F" onChange={(v) => set({ offset: Math.round(v) })} />
        </Field>
        <Field label="角速度">
          <NumField
            value={p.bullet.angularVelocity}
            step={0.1}
            onChange={(v) => setBullet({ angularVelocity: v })}
          />
        </Field>
        <Field label="出現ディレイ">
          <NumField
            value={p.bullet.delay}
            min={0}
            suffix="F"
            onChange={(v) => setBullet({ delay: Math.round(v) })}
          />
        </Field>
        <Field label="波の振幅">
          <NumField value={p.wave} suffix="°" onChange={(v) => set({ wave: v })} />
        </Field>
        <Field label="波の周期">
          <NumField value={p.wavePeriod} min={1} onChange={(v) => set({ wavePeriod: v })} />
        </Field>
      </Group>

      <Group title="モディファイア" defaultOpen={p.modifiers.length > 0}>
        {p.modifiers.map((m) => (
          <div key={m.id} className="rounded-lg border border-[var(--border)] p-1.5">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => s().updateModifier(emitterId, patternId, m.id, { enabled: !m.enabled })}
                className={`text-[11px] ${m.enabled ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`}
              >
                {m.enabled ? '◉' : '○'}
              </button>
              <span className="flex-1 text-[11.5px] font-medium">{MODIFIER_LABELS[m.type]}</span>
              <button
                className="text-[var(--muted)] hover:text-[#e05260]"
                onClick={() => s().removeModifier(emitterId, patternId, m.id)}
              >
                ×
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <MiniNum
                label="開始F"
                value={m.at}
                onChange={(v) =>
                  s().updateModifier(emitterId, patternId, m.id, { at: Math.round(v) })
                }
              />
              {!TIME_ONLY.includes(m.type) && (
                <>
                  <MiniNum
                    label="継続F"
                    value={m.duration}
                    onChange={(v) =>
                      s().updateModifier(emitterId, patternId, m.id, { duration: Math.round(v) })
                    }
                  />
                  <MiniNum
                    label={AMOUNT_LABELS[m.type][0]}
                    value={m.amount}
                    step={0.05}
                    onChange={(v) => s().updateModifier(emitterId, patternId, m.id, { amount: v })}
                  />
                  {AMOUNT_LABELS[m.type][1] && (
                    <MiniNum
                      label={AMOUNT_LABELS[m.type][1]!}
                      value={m.amount2}
                      step={0.05}
                      onChange={(v) =>
                        s().updateModifier(emitterId, patternId, m.id, { amount2: v })
                      }
                    />
                  )}
                </>
              )}
            </div>
            {m.type === 'graphic' && (
              <div className="mt-1.5">
                {hasSheet ? (
                  <ShotPicker
                    value={m.text || p.bullet.shotDataId}
                    onChange={(shotDataId) =>
                      s().updateModifier(emitterId, patternId, m.id, { text: shotDataId })
                    }
                  />
                ) : (
                  <input
                    type="text"
                    value={m.text ?? ''}
                    placeholder="変更後の ShotDataID"
                    onChange={(e) =>
                      s().updateModifier(emitterId, patternId, m.id, { text: e.target.value })
                    }
                  />
                )}
              </div>
            )}
          </div>
        ))}
        <Select
          value={''}
          options={[
            { value: '', label: '+ モディファイアを追加…' },
            ...MODIFIER_TYPES.map((t) => ({ value: t as string, label: MODIFIER_LABELS[t] })),
          ]}
          onChange={(v) => v && s().addModifier(emitterId, patternId, v as ModifierType)}
        />
      </Group>

      <Group title="履歴 / プレビュー">
        <Btn
          tone="primary"
          className="w-full"
          onClick={() => s().setFrame(p.startFrame + Math.round(sampleSeconds * FPS))}
        >
          現在の設定でプレビュー
        </Btn>
        <Field label="サンプル時間">
          <div className="flex items-center gap-2">
            <div className="w-[72px]">
              <NumField
                value={sampleSeconds}
                step={0.1}
                min={0}
                suffix="s"
                onChange={(v) => s().setSampleSeconds(v)}
              />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(1, len / FPS)}
              step={0.05}
              value={Math.min(sampleSeconds, len / FPS)}
              onChange={(e) => s().setSampleSeconds(parseFloat(e.target.value))}
            />
          </div>
        </Field>
      </Group>

      <div className="flex gap-1.5 p-3">
        <Btn className="flex-1" onClick={() => s().duplicatePattern(emitterId, patternId)}>
          複製
        </Btn>
        <Btn tone="danger" className="flex-1" onClick={() => s().removePattern(emitterId, patternId)}>
          削除
        </Btn>
      </div>
    </>
  )
}

function MiniNum({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="w-[52px] shrink-0 text-[10.5px] text-[var(--muted)]">{label}</span>
      <NumField value={value} onChange={onChange} step={step} />
    </label>
  )
}

// ---------------------------------------------------------------------------

function SoundProps({ soundId }: { soundId: string }) {
  const snd = useStore((s) => findSound(s.project, soundId))
  const s = useStore.getState
  if (!snd) return null
  return (
    <Group title="音声">
      <Field label="名前">
        <input
          type="text"
          value={snd.name}
          onChange={(e) => s().updateSound(soundId, { name: e.target.value })}
        />
      </Field>
      <Field label="ファイル">
        <label className="block cursor-pointer rounded-lg border border-[var(--border)] px-2 py-1.5 text-center text-[11.5px] hover:bg-[var(--hover)]">
          {snd.fileName || '音声を読み込む…'}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              await audioEngine.load(soundId, file)
              const frames = audioEngine.frames(soundId)
              s().updateSound(soundId, {
                fileName: file.name,
                src: 'loaded',
                endFrame: snd.startFrame + (frames || snd.endFrame - snd.startFrame),
              })
            }}
          />
        </label>
      </Field>
      <Field label="開始時間">
        <NumField
          value={snd.startFrame / FPS}
          step={0.1}
          min={0}
          suffix="s"
          onChange={(v) => {
            const len = snd.endFrame - snd.startFrame
            s().updateSound(soundId, {
              startFrame: Math.round(v * FPS),
              endFrame: Math.round(v * FPS) + len,
            })
          }}
        />
      </Field>
      <Field label="音量">
        <NumField
          value={snd.volume}
          step={0.05}
          min={0}
          max={1}
          onChange={(v) => s().updateSound(soundId, { volume: v })}
        />
      </Field>
      <Field label="パン">
        <NumField
          value={snd.pan}
          step={0.1}
          min={-1}
          max={1}
          onChange={(v) => s().updateSound(soundId, { pan: v })}
        />
      </Field>
      <Field label="フェードイン">
        <NumField
          value={snd.fadeIn}
          min={0}
          suffix="F"
          onChange={(v) => s().updateSound(soundId, { fadeIn: Math.round(v) })}
        />
      </Field>
      <Field label="フェードアウト">
        <NumField
          value={snd.fadeOut}
          min={0}
          suffix="F"
          onChange={(v) => s().updateSound(soundId, { fadeOut: Math.round(v) })}
        />
      </Field>
      <Field label="ループ">
        <Select
          value={snd.loop ? 'on' : 'off'}
          options={[
            { value: 'off', label: 'しない' },
            { value: 'on', label: 'する' },
          ]}
          onChange={(v) => s().updateSound(soundId, { loop: v === 'on' })}
        />
      </Field>
      <p className="text-[10.5px] leading-relaxed text-[var(--muted)]">
        音声はプレビュー専用です。出力スクリプトにはコメントアウトされた{' '}
        <code className="text-[var(--text-2)]">TSound</code> タスクが入ります。
      </p>
    </Group>
  )
}
