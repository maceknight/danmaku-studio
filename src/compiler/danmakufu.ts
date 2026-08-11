import type { Modifier } from '../types/dmk'
import type { ControlTaskNode, PatternTaskNode, SpawnNode, TimelineAst } from './ast'

/** AST → 東方弾幕風 ph3 script text. The only module that knows ph3 syntax. */

const IND = '    '

function n(v: number): string {
  if (!isFinite(v)) return '0'
  const r = Math.round(v * 10000) / 10000
  return Number.isInteger(r) ? String(r) : r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

/** `CX + (-120)` — always parenthesised so negatives never produce `+ -`. */
function ox(axis: 'CX' | 'CY', v: number): string {
  return `${axis} + (${n(v)})`
}

class Writer {
  private lines: string[] = []
  private depth = 0

  line(text = '') {
    this.lines.push(text.length ? IND.repeat(this.depth) + text : '')
    return this
  }
  open(text: string) {
    this.line(text)
    this.depth++
    return this
  }
  close(text = '}') {
    this.depth = Math.max(0, this.depth - 1)
    this.line(text)
    return this
  }
  blank() {
    this.lines.push('')
    return this
  }
  toString() {
    return this.lines.join('\r\n')
  }
}

// ---------------------------------------------------------------------------

function shotCreateCall(s: SpawnNode): string {
  const b = s.bullet
  if (s.patternType === 'laser') {
    if (s.laserType === 'loose') {
      // 射出式（まち針）— 発射元から伸びながら飛ぶ
      return `CreateLooseLaserA1(ox, oy, spd, ang, ${n(s.laserLength)}, ${n(s.laserWidth)}, ${
        b.shotDataId
      }, ${n(b.delay)})`
    }
    // 固定式 — 第8引数が予告線の表示フレーム数になる
    return `CreateStraightLaserA1(ox, oy, ang, ${n(s.laserLength)}, ${n(s.laserWidth)}, ${n(
      b.life,
    )}, ${b.shotDataId}, ${n(s.laserDelay)})`
  }
  if (b.accel !== 0) {
    return `CreateShotA2(ox, oy, spd, ang, ${n(b.accel)}, ${n(b.maxSpeed)}, ${b.shotDataId}, ${n(
      b.delay,
    )})`
  }
  return `CreateShotA1(ox, oy, spd, ang, ${b.shotDataId}, ${n(b.delay)})`
}

/**
 * Speed multiplier expression, mirroring `shapeSpeedFactor` in the engine.
 * ph3 trig works in degrees, which is why there is no radian conversion here.
 */
function speedFactorExpr(s: SpawnNode): string | null {
  switch (s.patternType) {
    case 'oval': {
      const r = Math.max(0.05, s.ovalRatio)
      return `${n(r)} / sqrt(cos(ang - ${n(s.shapeTilt)}) * cos(ang - ${n(
        s.shapeTilt,
      )}) + ${n(r * r)} * sin(ang - ${n(s.shapeTilt)}) * sin(ang - ${n(s.shapeTilt)}))`
    }
    case 'polygon': {
      const sides = Math.max(3, Math.round(s.polygonSides))
      const step = 360 / sides
      return `1 / cos(((ang - ${n(s.shapeTilt)}) % ${n(step)} + ${n(step)}) % ${n(step)} - ${n(
        step / 2,
      )})`
    }
    case 'rose': {
      const k = Math.max(1, Math.round(s.rosePetals))
      return `0.35 + 0.65 * absolute(cos(${n(k)} * (ang - ${n(s.shapeTilt)})))`
    }
    default:
      return null
  }
}

/** Per-index angle expression, mirroring engine/patterns.ts. */
function angleExpr(s: SpawnNode): string {
  switch (s.patternType) {
    case 'circle':
    case 'ring':
    case 'flower':
    case 'burst':
    case 'spiral':
    case 'oval':
    case 'polygon':
    case 'rose':
      return `angBase + (360 / ${n(s.count)}) * i`
    case 'line':
    case 'whip':
      return 'angBase'
    case 'cross':
      return `angBase + 90 * (i % 4) + trunc(i / 4) * ${n(s.angleSpread / Math.max(1, s.count))}`
    case 'random':
      return `angBase + rand(${n(-s.angleSpread / 2)}, ${n(s.angleSpread / 2)})`
    default:
      return s.count > 1
        ? `angBase - ${n(s.angleSpread / 2)} + (${n(s.angleSpread)} / ${n(s.count - 1)}) * i`
        : 'angBase'
  }
}

function writeSpawn(w: Writer, t: PatternTaskNode) {
  const s = t.spawn
  const b = s.bullet

  const baseParts: string[] = []
  if (s.aimPlayer) baseParts.push('ObjMove_GetAngleToPlayer(objBoss)')
  else baseParts.push(n(s.angleBase + t.rotation))
  if (s.angleStep !== 0) baseParts.push(`${n(s.angleStep * s.spinDirection)} * shotIndex`)
  if (s.wave !== 0 && s.wavePeriod > 0)
    baseParts.push(`sin(shotIndex / ${n(s.wavePeriod)} * 360) * ${n(s.wave)}`)

  w.line(`let angBase = ${baseParts.join(' + ')};`)
  if (t.followsBoss) {
    w.line('let bx = ObjMove_GetX(objBoss);')
    w.line('let by = ObjMove_GetY(objBoss);')
  } else {
    w.line(`let bx = ${ox('CX', t.originX)};`)
    w.line(`let by = ${ox('CY', t.originY)};`)
  }

  const layered = s.layers > 1
  if (layered) w.open(`ascent(l in 0..${n(s.layers)}) {`)
  const baseSpeed = layered ? `${n(b.speed)} + ${n(s.layerSpeedStep)} * l` : n(b.speed)
  w.line(`let spdBase = ${baseSpeed};`)

  w.open(`ascent(i in 0..${n(s.count)}) {`)
  w.line(
    `let ang = ${angleExpr(s)}${
      s.angleRandom > 0 ? ` + rand(${n(-s.angleRandom)}, ${n(s.angleRandom)})` : ''
    };`,
  )

  // speed is per-index: shaped volleys bend the ring by varying it with angle
  const factor = speedFactorExpr(s)
  const parts = [factor ? `spdBase * (${factor})` : 'spdBase']
  if (s.patternType === 'whip') parts.push(`${n(s.speedStep)} * i`)
  if (b.speedRand > 0) parts.push(`rand(${n(-b.speedRand)}, ${n(b.speedRand)})`)
  w.line(`let spd = ${parts.join(' + ')};`)

  if (s.patternType === 'line') {
    // spread the muzzle sideways rather than fanning the angles
    w.line(`let side = (i - ${n((s.count - 1) / 2)}) * ${n(s.lineSpacing)};`)
    w.line(`let ox = bx + cos(ang) * ${n(s.radius)} + cos(ang + 90) * side;`)
    w.line(`let oy = by + sin(ang) * ${n(s.radius)} + sin(ang + 90) * side;`)
  } else if (s.radius !== 0) {
    w.line(`let ox = bx + cos(ang) * ${n(s.radius)};`)
    w.line(`let oy = by + sin(ang) * ${n(s.radius)};`)
  } else {
    w.line('let ox = bx;')
    w.line('let oy = by;')
  }
  w.line(`let obj = ${shotCreateCall(s)};`)
  if (b.angularVelocity !== 0) w.line(`ObjMove_SetAngularVelocity(obj, ${n(b.angularVelocity)});`)
  if (b.accel !== 0) w.line(`ObjMove_SetMaxSpeed(obj, ${n(b.maxSpeed)});`)
  if (b.scale !== 1) w.line(`ObjRender_SetScaleXYZ(obj, ${n(b.scale)}, ${n(b.scale)}, 1);`)
  if (b.blend === 'add') w.line('ObjRender_SetBlendType(obj, BLEND_ADD_ARGB);')
  if (b.blend === 'multiply') w.line('ObjRender_SetBlendType(obj, BLEND_MULTIPLY);')
  if (b.life > 0 && s.patternType !== 'laser') w.line(`TLife(obj, ${n(b.life)});`)
  if (s.controlTask) w.line(`${s.controlTask}(obj);`)
  w.close()
  if (layered) w.close()
}

function writePatternTask(w: Writer, t: PatternTaskNode) {
  const clipLen = Math.max(0, t.endFrame - t.startFrame)
  const cycleLen = t.loop ? Math.max(1, t.loopInterval) : clipLen
  const cycles = t.loop ? Math.max(1, Math.floor(clipLen / cycleLen)) : 1
  const shotsPerCycle = Math.floor(Math.max(0, cycleLen - t.offset) / t.interval) + 1
  const tail = Math.max(0, cycleLen - t.offset - shotsPerCycle * t.interval)

  w.blank()
  w.line(
    `// ${t.emitterName} / ${t.patternName}  [frame ${t.startFrame} - ${t.endFrame}]${
      t.loop ? ` loop ${cycleLen}F x${cycles}` : ''
    }`,
  )
  w.open(`task ${t.taskName} {`)
  if (t.startFrame > 0) w.line(`wait(${t.startFrame});`)
  if (cycles > 1) w.open(`loop(${cycles}) {`)
  if (t.offset > 0) w.line(`wait(${t.offset});`)
  w.line('let shotIndex = 0;')
  w.open(`loop(${shotsPerCycle}) {`)
  writeSpawn(w, t)
  w.line('shotIndex++;')
  w.line(`wait(${t.interval});`)
  w.close()
  if (cycles > 1) {
    if (tail > 0) w.line(`wait(${tail});`)
    w.close()
  }
  w.close()
}

function writeControlTask(w: Writer, c: ControlTaskNode) {
  const mods = [...c.modifiers].sort((a, b) => a.at - b.at)
  w.blank()
  w.open(`task ${c.taskName}(obj) {`)
  let cursor = 0
  for (const m of mods) {
    const d = Math.max(0, Math.round(m.at - cursor))
    if (d > 0) w.line(`wait(${d});`)
    cursor = Math.max(cursor, m.at)
    w.line('if (Obj_IsDeleted(obj)) { return; }')
    writeModifier(w, m)
    if (m.duration > 0 && m.type !== 'split' && m.type !== 'random' && m.type !== 'destroy') {
      cursor = m.at + m.duration
    }
  }
  w.close()
}

function writeModifier(w: Writer, m: Modifier) {
  const dur = Math.max(1, Math.round(m.duration))
  switch (m.type) {
    case 'rotate':
      w.line(`ObjMove_SetAngularVelocity(obj, ${n(m.amount)});`)
      if (m.duration > 0) {
        w.line(`wait(${dur});`)
        w.line('ObjMove_SetAngularVelocity(obj, 0);')
      }
      break
    case 'accel':
      w.line(`ObjMove_SetAcceleration(obj, ${n(m.amount)});`)
      if (m.duration > 0) {
        w.line(`wait(${dur});`)
        w.line('ObjMove_SetAcceleration(obj, 0);')
      }
      break
    case 'gravity':
      // ph3 has no gravity primitive — integrate it by hand.
      w.line('let gvx = 0;')
      w.line('let gvy = 0;')
      w.open(`loop(${dur}) {`)
      w.line(`gvx += ${n(m.amount2)};`)
      w.line(`gvy += ${n(m.amount)};`)
      w.line('ObjMove_SetX(obj, ObjMove_GetX(obj) + gvx);')
      w.line('ObjMove_SetY(obj, ObjMove_GetY(obj) + gvy);')
      w.line('yield;')
      w.close()
      break
    case 'fade':
      w.line('let a0 = ObjRender_GetAlpha(obj);')
      w.open(`ascent(k in 1..${dur + 1}) {`)
      w.line(`ObjRender_SetAlpha(obj, a0 + (${n(m.amount * 255)} - a0) * k / ${dur});`)
      w.line('yield;')
      w.close()
      if (m.amount <= 0) {
        w.line('Obj_Delete(obj);')
        w.line('return;')
      }
      break
    case 'scale':
      w.line('let s0 = ObjRender_GetScaleX(obj);')
      w.open(`ascent(k in 1..${dur + 1}) {`)
      w.line(`let sc = s0 + (${n(m.amount)} - s0) * k / ${dur};`)
      w.line('ObjRender_SetScaleXYZ(obj, sc, sc, 1);')
      w.line('yield;')
      w.close()
      break
    case 'random':
      w.line(
        `ObjMove_SetAngle(obj, ObjMove_GetAngle(obj) + rand(${n(-m.amount2)}, ${n(m.amount2)}));`,
      )
      if (m.amount !== 0)
        w.line(
          `ObjMove_SetSpeed(obj, ObjMove_GetSpeed(obj) + rand(${n(-m.amount)}, ${n(m.amount)}));`,
        )
      break
    case 'split': {
      const count = Math.max(2, Math.round(m.amount))
      w.line('let sx = ObjMove_GetX(obj);')
      w.line('let sy = ObjMove_GetY(obj);')
      w.line('let sa = ObjMove_GetAngle(obj);')
      w.line('let ss = ObjMove_GetSpeed(obj);')
      w.open(`ascent(k in 0..${count}) {`)
      w.line(
        `CreateShotA1(sx, sy, ss, sa - ${n(m.amount2 / 2)} + (${n(m.amount2)} / ${n(
          count - 1,
        )}) * k, SHOT_SPLIT_ID, 0);`,
      )
      w.close()
      break
    }
    case 'graphic':
      if (m.text && m.text.trim()) w.line(`ObjShot_SetGraphic(obj, ${m.text.trim()});`)
      break
    case 'reaim':
      w.line(
        'ObjMove_SetAngle(obj, atan2(GetPlayerY() - ObjMove_GetY(obj), GetPlayerX() - ObjMove_GetX(obj)));',
      )
      break
    case 'destroy':
      w.line('Obj_Delete(obj);')
      w.line('return;')
      break
    case 'wait':
      w.line(`wait(${dur});`)
      break
  }
}

// ---------------------------------------------------------------------------

export function generateDanmakufu(ast: TimelineAst): string {
  const w = new Writer()
  const splitId = ast.shotDataIds[0] ?? 'WHITE01'

  w.line('#TouhouDanmakufu[Single]')
  w.line('#ScriptVersion[3]')
  w.line(`#Title["${ast.title.replace(/"/g, "'")}"]`)
  w.line('#Text["Generated by Danmaku Studio"]')
  w.blank()
  w.line(`#include "${ast.shotConstInclude}"`)
  w.blank()
  w.line('let CX = GetCenterX();')
  w.line('let CY = GetCenterY();')
  w.line(`let SHOT_SPLIT_ID = ${splitId};`)
  w.line('let objBoss;')
  w.blank()

  w.open('@Initialize {')
  w.line('objBoss = ObjEnemy_Create(OBJ_ENEMY_BOSS);')
  w.line('ObjEnemy_Regist(objBoss);')
  w.line(`ObjEnemy_SetLife(objBoss, ${n(ast.bossLife)});`)
  w.line(`ObjMove_SetPosition(objBoss, ${ox('CX', ast.bossX)}, ${ox('CY', ast.bossY)});`)
  w.blank()
  for (const t of ast.moveTasks) w.line(`${t.taskName}();`)
  for (const t of ast.patternTasks) w.line(`${t.taskName}();`)
  if (ast.sounds.length > 0)
    w.line('// TSound(); // audio export is intentionally opt-in — see the block at the end')
  w.line('TFinish();')
  w.close()
  w.blank()

  w.open('@MainLoop {')
  w.line(
    'ObjEnemy_SetIntersectionCircleToShot(objBoss, ObjMove_GetX(objBoss), ObjMove_GetY(objBoss), 32);',
  )
  w.line(
    'ObjEnemy_SetIntersectionCircleToPlayer(objBoss, ObjMove_GetX(objBoss), ObjMove_GetY(objBoss), 24);',
  )
  w.line('yield;')
  w.close()
  w.blank()
  w.open('@DrawLoop {')
  w.close()
  w.blank()
  w.open('@Finalize {')
  w.close()
  w.blank()

  w.line(`// timeline length: ${ast.duration} frames`)
  w.open('task TFinish {')
  w.line(`wait(${n(ast.duration)});`)
  w.line('Obj_Delete(objBoss);')
  w.line('CloseScript(GetOwnScriptID());')
  w.close()
  w.blank()
  w.line('// bullet lifetime helper — one microthread per shot')
  w.open('task TLife(obj, frames) {')
  w.line('wait(frames);')
  w.line('if (!Obj_IsDeleted(obj)) { Obj_Delete(obj); }')
  w.close()

  if (ast.moveTasks.length > 1) {
    w.blank()
    w.line('// WARNING: several emitters are keyframed but there is a single boss object here —')
    w.line('//          their motion tasks all drive objBoss and will fight each other.')
  }
  for (const t of ast.moveTasks) {
    w.blank()
    w.line(`// keyframed motion: ${t.emitterName}`)
    w.open(`task ${t.taskName} {`)
    let cursor = 0
    for (const seg of t.segments) {
      const wait = Math.max(0, seg.atFrame - cursor)
      if (wait > 0) w.line(`wait(${wait});`)
      cursor = seg.atFrame
      const frames = Math.max(1, Math.round(seg.frames))
      w.line(`ObjMove_SetDestAtFrame(objBoss, ${ox('CX', seg.x)}, ${ox('CY', seg.y)}, ${frames});`)
      w.line(`wait(${frames});`)
      cursor += frames
    }
    w.close()
  }

  for (const t of ast.patternTasks) writePatternTask(w, t)
  for (const c of ast.controlTasks) writeControlTask(w, c)

  if (ast.sounds.length > 0) {
    w.blank()
    w.line('/*')
    w.line(' * Audio export (preview-only in this version).')
    w.line(' * Uncomment TSound() in @Initialize and fix the paths to enable it.')
    w.line(' *')
    w.line(' * task TSound {')
    let cursor = 0
    for (const s of [...ast.sounds].sort((a, b) => a.frame - b.frame)) {
      const d = Math.max(0, s.frame - cursor)
      if (d > 0) w.line(` *     wait(${d});`)
      cursor = s.frame
      const path = `GetCurrentScriptDirectory() ~ "se/${s.fileName}"`
      w.line(
        s.loop
          ? ` *     PlayBGM(${path}, 0, 0); // volume ${n(s.volume)}`
          : ` *     PlaySE(${path}); // volume ${n(s.volume)}`,
      )
    }
    w.line(' * }')
    w.line(' */')
  }

  w.blank()
  return w.toString()
}
