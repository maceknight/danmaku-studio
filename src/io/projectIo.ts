import { generateDanmakufu } from '../compiler/danmakufu'
import { lower } from '../compiler/lower'
import { FPS, type Project } from '../types/dmk'

const safeName = (s: string) => s.replace(/[^0-9A-Za-z_\-ぁ-んァ-ヶ一-龠]+/g, '_') || 'danmaku'

export function download(name: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Loaded audio is session-scoped and never serialised. */
export function serializeProject(project: Project): string {
  const clean = structuredClone(project)
  for (const s of clean.sounds) s.src = null
  return JSON.stringify(clean, null, 2)
}

export function compileToDanmakufu(project: Project): string {
  return generateDanmakufu(lower(project))
}

/** Flat clip listing — handy for spreadsheets and diffing patterns. */
export function compileToCsv(project: Project): string {
  const rows: string[][] = [
    [
      'emitter',
      'pattern',
      'type',
      'start_frame',
      'end_frame',
      'start_sec',
      'end_sec',
      'interval',
      'count',
      'layers',
      'angle_base',
      'angle_spread',
      'angle_step',
      'speed',
      'accel',
      'life',
      'shot_data_id',
      'modifiers',
    ],
  ]
  for (const e of project.emitters) {
    for (const p of e.patterns) {
      rows.push([
        e.name,
        p.name,
        p.type,
        String(p.startFrame),
        String(p.endFrame),
        (p.startFrame / FPS).toFixed(2),
        (p.endFrame / FPS).toFixed(2),
        String(p.interval),
        String(p.count),
        String(p.layers),
        String(p.angleBase),
        String(p.angleSpread),
        String(p.angleStep),
        String(p.bullet.speed),
        String(p.bullet.accel),
        String(p.bullet.life),
        p.bullet.shotDataId,
        p.modifiers.filter((m) => m.enabled).map((m) => `${m.type}@${m.at}`).join(' '),
      ])
    }
  }
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\r\n')
}

export function saveDmk(project: Project) {
  download(`${safeName(project.name)}.dmk`, serializeProject(project), 'application/json')
}

export function exportPh3(project: Project) {
  download(`${safeName(project.name)}.txt`, compileToDanmakufu(project), 'text/plain')
}

export function exportJson(project: Project) {
  download(`${safeName(project.name)}.json`, serializeProject(project), 'application/json')
}

export function exportCsv(project: Project) {
  download(`${safeName(project.name)}.csv`, compileToCsv(project), 'text/csv')
}

export async function openDmk(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.dmk,.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const parsed = JSON.parse(await file.text()) as Project
        if (!parsed.settings || !Array.isArray(parsed.emitters)) {
          throw new Error(
            parsed.version === undefined
              ? '.dmk ファイルではありません'
              : `旧形式 (v${parsed.version}) の .dmk です。v2 のみ読み込めます`,
          )
        }
        resolve(parsed)
      } catch (err) {
        alert(`読み込みに失敗しました: ${(err as Error).message}`)
        resolve(null)
      }
    }
    input.click()
  })
}
