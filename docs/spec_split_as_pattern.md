# 実装指示書 — 分裂の子弾をパターンライブラリ対応にする

対象: `danmaku-studio/`
目的: **「壁に当たったらレーザーに変わる」**のような表現を作れるようにする。
現状の分裂は「扇状に n 発ばらまく」固定だが、これを**パターンライブラリの全種別**
（circle / spiral / laser / oval / rose / line / whip …）から選べるようにする。

前提は `docs/spec_wall_and_playmode.md` の「0. 前提」と同じ。層の分離を壊さない。
型チェック `npx tsc --noEmit -p tsconfig.json` は **EXIT 0** にすること。

---

## 1. 考え方

分裂は結局**「親弾のいる場所から小さいパターンを1回撃つ」**でしかない。
なので子弾の設定を独自ロジックで持つのをやめ、**Pattern を合成して既存の
`resolveShot()` に通す**。こうすると oval も rose も laser も、
形状の計算を一切書き足さずに全部使えるようになる。

親から受け継ぐもの・子で上書きするものを明確に分ける:

- **子で指定**: 種別 / 弾数 / 拡がり角 / 角度ずれ / 半径 / 速度 / 速度ばらつき /
  サイズ / 寿命 / ShotDataID / レーザー各種
- **親から継承**: 形状の細かいパラメータ（`ovalRatio` `shapeTilt` `polygonSides`
  `rosePetals` `lineSpacing` `speedStep` `layers` `layerSpeedStep` `wave` など）
  → 子側の設定項目を増やしすぎないための割り切り。UI にも「形状の細かい設定は
  親のパターンを引き継ぎます」と注記する。

---

## 2. データモデル `src/types/dmk.ts`

`SplitChild` に追加:

```ts
  /** 子弾をどの形で撃つか。パターンライブラリと同じ種別 */
  type: PatternType
  /** type === 'laser' のとき使う */
  laserType: LaserType
  laserLength: number
  laserWidth: number
  laserDelay: number
```

`src/types/factory.ts` の `defaultSplitChild()`:
`type: 'nway'`（＝現状の扇と同じ見た目）, `laserType: 'straight'`,
`laserLength: 200`, `laserWidth: 12`, `laserDelay: 30` を追加。

`splitChildOf()` の旧データ読み替えにも上記の既定値が入るようにすること
（`...defaultSplitChild()` を先に展開しているので自動的に入るはず。確認だけする）。

---

## 3. シミュレーション `src/engine/sim.ts`

`applySplit()`（既存）を書き換える。今の「角度を手で割り振って emit する」ループを捨て、
**合成 Pattern → `resolveShot()`** に置き換える。

```ts
const cfg = splitChildOf(mod)
const childPattern: Pattern = {
  ...parentPattern,
  type: cfg.type,
  count: Math.max(1, Math.round(cfg.count)),
  angleBase: b.angle + cfg.angleOffset,   // 親の進行方向が基準
  angleSpread: cfg.angleSpread,
  radius: cfg.radius,
  // 1回きりの発射なので、ショット単位で進むものは無効化する
  angleStep: 0,
  wave: 0,
  aimPlayer: false,
  mirrorMode: 'none',
  angleRandom: 0,
  laserType: cfg.laserType,
  laserLength: cfg.laserLength,
  laserWidth: cfg.laserWidth,
  laserDelay: cfg.laserDelay,
  bullet: {
    ...parentPattern.bullet,
    speed: cfg.inheritSpeed ? b.speed : cfg.speed,
    speedRand: cfg.speedRand,
    scale: cfg.scale,
    life: cfg.life,
    delay: 0,
    shotDataId: cfg.shotDataId || parentPattern.bullet.shotDataId,
    // 子は加減速を引き継がない（親の途中状態から再開すると分かりにくい）
    rampDuration: 0,
  },
}
const specs = resolveShot(childPattern, 0, 0, aimAngle, this.rng)
for (const s of specs) {
  const child = this.emit(childPattern, b.patternIdx, b.x + s.dx, b.y + s.dy, s.angle, s.speed, 1)
  ...
}
```

注意点:

- **`this.emit()` の第1引数に `childPattern` を渡すこと。** そうしないと
  レーザー種別（`kind`）や寿命が親のものになる。ただし第2引数の `patternIdx` は
  **親のまま**にする（モディファイア解決に使われるが、子はモディファイアを
  受けない仕様なので実害はなく、レンダラのバケット選択にも影響しない）。
- `emit()` の中で `b.shotId = this.resolveShotId(bd.shotDataId)` が走るので、
  子の ShotDataID は `childPattern.bullet.shotDataId` 経由で自然に効く。
  既存の「`childShot > 0` なら上書き」処理は**不要になるので消すこと**。
- 子弾は引き続き `depth = 1`。モディファイアは適用されない（既存仕様、維持）。
- `resolveShot` の `aimAngle` 引数は使われない（`aimPlayer: false` のため）ので
  `0` でよい。
- **レーザーの子**: `emit()` は `p.type === 'laser'` を見て `kind` を決めるので、
  `childPattern.type = 'laser'` にすれば固定式/射出式が正しく作られる。
  固定式なら `laserDelay` が予告線になる。

---

## 4. ph3 出力 `src/compiler/`

ここが一番手間がかかる。今は `writeModifier` の `split` ケースが
`CreateShotA1` を直接1行書いているが、**形状ごとの角度・速度式が必要**になるので
既存の `writeSpawn()` を再利用する形にする。

方針:

1. `writeSpawn(w, t: PatternTaskNode)` を分解し、**発射位置の起点だけを差し替えられる**
   ようにする。たとえば:

   ```ts
   function writeSpawnBody(w: Writer, s: SpawnNode, rotation: number, origin: { x: string; y: string; angleBase: string })
   ```

   - パターンタスクからの呼び出し: `origin.x = 'bx'`, `origin.y = 'by'`,
     `angleBase` は現状の `angBase` 式
   - 分裂からの呼び出し: `origin.x = 'sx'`, `origin.y = 'sy'`,
     `angleBase = 'ObjMove_GetAngle(obj) + <angleOffset>'`
   - `shotIndex` に依存する項（`angleStep * shotIndex`、`wave`）は
     分裂側では 0 になるので出力しない

2. `lower.ts` で `SplitChild` → `SpawnNode` に落とす。
   `ControlTaskNode` の各モディファイアに、split の場合は `childSpawn: SpawnNode` を
   持たせるのが素直。`SpawnNode` の `controlTask` は `null` にする（子は制御なし）。

3. `writeModifier` の `split` ケースは、
   ```
   let sx = ObjMove_GetX(obj);
   let sy = ObjMove_GetY(obj);
   let ss = ObjMove_GetSpeed(obj);   // inheritSpeed のときだけ
   <writeSpawnBody(...)>
   ```
   に置き換える。`spdBase` は `inheritSpeed` なら `ss`、そうでなければ数値。

4. **壁タスク（`TWall*`）の中から呼ばれる場合も同じコードで動くこと。**
   壁タスクは毎フレーム回るので `wait` を出してはいけない、という既存の制約は
   そのまま守る（`writeModifierInstant` 側の分岐）。分裂は元々 `wait` を出さないので
   問題ないはずだが、必ず確認すること。

---

## 5. UI `src/ui/Properties.tsx`

`SplitChildEditor` に追加:

- 先頭に**パターン種別のグリッド**。`src/ui/PatternLibrary.tsx` と同じく
  `PATTERN_LIBRARY` を回して `PatternGlyph` を並べ、選択中をハイライトする。
  横は6列程度。ライブラリ本体と同じ見た目にすること。
- `type === 'laser'` のときだけレーザー用フィールドを出す:
  レーザー種別（固定式/射出式）/ レーザー長 / レーザー幅 /
  固定式なら予告線の長さ
- 既存フィールド（弾数・拡がり角・角度ずれ・半径・サイズ・寿命・速度）はそのまま
- 末尾に注記: `形状の細かい設定（楕円の比率・花弁の数など）は親のパターンを引き継ぎます`

---

## 6. 検証（必須・数値で確認）

`npm run dev --prefix danmaku-studio` → `mcp__Claude_Browser__javascript_tool` で
`await import('/src/engine/sim.ts')` などを直接叩いて数値を取る。
スクリーンショットは撮れないので使わないこと。

1. **円形分裂** — `type='circle'`, `count=12` の分裂で、子弾12発の角度が
   30°刻みで一周していることを確認。
2. **レーザー分裂（固定式）** — `type='laser'`, `laserType='straight'` で、
   子弾の `kind === 1`、`telegraph` が `laserDelay` と一致することを確認。
3. **レーザー分裂（射出式）** — `laserType='loose'` で `kind === 2`、
   `travel` が伸びていくことを確認。
4. **壁 → レーザー** — 親を `wallBehavior='bounce'`、
   分裂モディファイアを `trigger='wall'`, `at=1`, `type='laser'` にして、
   **壁に当たった直後に kind 1 or 2 の子弾が出る**ことを確認。これが本命の用途。
5. **速度の継承** — `inheritSpeed=true` で子の速度が親と一致、
   `false` で指定値になることを確認。
6. **ShotDataID** — 子に別の弾を指定して `shotId` が変わることを確認。
7. **ph3 出力** — 上記それぞれで `undefined` / `NaN` が無いこと、
   円形分裂なら角度式が、レーザー分裂なら `CreateStraightLaserA1` /
   `CreateLooseLaserA1` が出力されていることを確認。
8. **非破壊** — サンプル13本が読み込め、ph3 出力が通ること。
   旧形式の分裂（`child` が無く `amount`/`amount2` だけ）も従来どおり動くこと。

## 7. やらないこと

- 子弾へのモディファイア適用（既存仕様どおり適用しない）
- 子弾の再分裂
- `.dmk` のバージョン変更
- git commit / push / `npm run deploy`
