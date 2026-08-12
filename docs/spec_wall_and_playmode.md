# 実装指示書 — 壁の接触判定 / プレイモード（自機移動）

対象リポジトリ: `danmaku-studio/`
この文書だけで実装できるように書いてある。設計判断は済んでいるので、原則そのとおりに実装すること。
迷ったら「既存のやり方に合わせる」を優先。

---

## 0. 前提（このプロジェクトの決めごと）

- **層の分離を壊さない。**
  - `src/engine/` は React も PixiJS も import しない純モジュール
  - `src/render/stage.ts` は PixiJS のみ。Simulator の内部を知らない
  - ph3 構文を知るのは `src/compiler/danmakufu.ts` だけ
  - `src/types/dmk.ts` が `.dmk` スキーマ＝唯一の中間データ
- **プレビューと ph3 出力は同じ挙動になること。** 片方だけ実装して終わりにしない。
- 型チェックは `npx tsc --noEmit -p tsconfig.json`（**必ず EXIT 0 にする**）
- コメントは「なぜそうしたか」を書く。何をしているかの説明は不要。
- 既存の `.dmk` が壊れないこと。新フィールドは必ず既定値でフォールバックする
  （例: `p.bullet.wallBehavior ?? 'none'`）。バージョンは上げない。

---

## 1. 壁の接触判定

### 1-1. 考え方

「壁に当たったら変化する」を**新しいモディファイア種別を増やさずに**実現する。
モディファイアに **トリガー** の概念を足し、既存の全種別（分裂・弾変更・再照準・加減速・
フェード…）を壁接触で発火できるようにする。これが一番表現力が高く、覚えることも増えない。

壁＝**ステージ矩形**（`±stageWidth/2`, `±stageHeight/2`）。
画面外カリング用のマージン（`OUT_MARGIN = 96`）とは別物なので混同しないこと。

### 1-2. データモデル `src/types/dmk.ts`

```ts
export type WallBehavior = 'none' | 'bounce' | 'wrap' | 'vanish'
```

`BulletDef` に追加:

```ts
  /** 壁に触れたときの挙動 */
  wallBehavior: WallBehavior
  /** bounce / wrap の最大回数。0 = 無制限 */
  wallBounces: number
```

`Modifier` に追加:

```ts
  /**
   * 発火条件。'age' は既定で、`at` を弾の経過フレームとして扱う。
   * 'wall' のときは `at` を「何回目の壁接触か」として扱う（1 = 最初の接触）。
   */
  trigger?: 'age' | 'wall'
```

`src/types/factory.ts` の `defaultBullet()` に `wallBehavior: 'none'`, `wallBounces: 0` を追加。

### 1-3. シミュレーション `src/engine/`

`src/engine/types.ts` の `SimBullet` に追加:

```ts
  /** これまでに壁へ当たった回数 */
  wallHits: number
```
`makeBullet()` の初期値は `0`。`sim.ts` の `emit()` でも `b.wallHits = 0` を設定。

`sim.ts` の `integrate()` — **位置を更新した直後、画面外カリングより前**に壁処理を入れる。

```
const behavior = pat?.bullet.wallBehavior ?? 'none'
if (behavior !== 'none') {
  const hw = settings.stageWidth / 2
  const hh = settings.stageHeight / 2
  let hit = false
  // 左右
  if (b.x < -hw || b.x > hw) {
    hit = true
    if (behavior === 'bounce') {
      b.x = b.x < -hw ? -hw : hw
      b.angle = 180 - b.angle        // 縦の壁は左右反転
    } else if (behavior === 'wrap') {
      b.x = b.x < -hw ? hw : -hw
    }
  }
  // 上下（left/right と別に判定する。角で両方当たることがある）
  if (b.y < -hh || b.y > hh) {
    hit = true
    if (behavior === 'bounce') {
      b.y = b.y < -hh ? -hh : hh
      b.angle = -b.angle             // 横の壁は上下反転
    } else if (behavior === 'wrap') {
      b.y = b.y < -hh ? hh : -hh
    }
  }
  if (hit) {
    b.wallHits += 1
    if (behavior === 'vanish') { release; continue }
    const limit = pat.bullet.wallBounces
    if (limit > 0 && b.wallHits >= limit) { release; continue }
  }
}
```

注意点:
- `vanish` は「マージンではなくステージ端ちょうどで消える」挙動。
- `bounce` / `wrap` の弾は既存の画面外カリングに引っかからないはずだが、
  数値誤差で外に出たままにならないよう、必ず位置をクランプしてから角度を変えること。
- **レーザー（`kind === 1` 固定式）は壁処理の対象外**にする。原点固定なので意味がない。
  射出式（`kind === 2`）は対象に含めてよい。

`applyModifiers()` — 発火条件の分岐。現状は `age` 基準で `within` を計算しているので、
`trigger === 'wall'` の場合だけ別経路にする:

```
if ((mod.trigger ?? 'age') === 'wall') {
  // 壁に at 回目で当たったときに一度だけ
  if (b.wallHits < Math.max(1, mod.at) || (b.fired & bit)) continue
  b.fired |= bit
  // …ここから下は既存の switch と同じ処理を「一度きり」として実行する
} else {
  // 既存の age 基準の within 判定
}
```

実装が読みやすくなるなら、switch の中身を `applyModifierEffect(b, index, mod, bit, progress)`
のような関数に切り出してよい。**duration を持つ種別（accel / fade / scale / gravity）を
wall トリガーで使った場合は、その場で最終値を一発適用する**（毎フレーム補間はしない）。
理由: 壁接触は瞬間的なイベントで、そこから継続補間する状態を持たせると
スナップショット復元が壊れるため。

### 1-4. ph3 出力 `src/compiler/`

`ast.ts` の `SpawnNode` に `wallBehavior: WallBehavior` と `wallBounces: number` を追加。
`ControlTaskNode` にも壁トリガーのモディファイアが分かるように渡す。
`lower.ts` で `p.bullet` から詰める。

`danmakufu.ts`:

1. スクリプト先頭のグローバルに壁の座標を出す（`CX`/`CY` の定義の直後）:

```
let WALL_L = CX - <stageWidth/2>;
let WALL_R = CX + <stageWidth/2>;
let WALL_T = CY - <stageHeight/2>;
let WALL_B = CY + <stageHeight/2>;
```

2. `wallBehavior !== 'none'` のパターンには壁監視タスクを生成し、`writeSpawn` の
   `TLife(obj, …)` の近くで `TWall<PatternName>(obj);` を呼ぶ。

```
task TWall<Name>(obj) {
    let hits = 0;
    loop {
        if (Obj_IsDeleted(obj)) { return; }
        let x = ObjMove_GetX(obj);
        let y = ObjMove_GetY(obj);
        let a = ObjMove_GetAngle(obj);
        let hit = false;
        if (x < WALL_L) { ObjMove_SetX(obj, WALL_L); a = 180 - a; hit = true; }
        if (x > WALL_R) { ObjMove_SetX(obj, WALL_R); a = 180 - a; hit = true; }
        if (y < WALL_T) { ObjMove_SetY(obj, WALL_T); a = -a; hit = true; }
        if (y > WALL_B) { ObjMove_SetY(obj, WALL_B); a = -a; hit = true; }
        if (hit) {
            ObjMove_SetAngle(obj, a);
            hits++;
            // ここに壁トリガーのモディファイアを hits の値で分岐して展開する
            // 上限がある場合: if (hits >= <limit>) { Obj_Delete(obj); return; }
        }
        yield;
    }
}
```

- `wrap` の場合は `ObjMove_SetX(obj, WALL_R)` のように反対側へ飛ばし、角度は変えない。
- `vanish` の場合は当たった時点で `Obj_Delete(obj); return;`。
- 壁トリガーのモディファイアは、既存の `writeModifier` を再利用して
  `if (hits == <at>) { … }` の中に展開する。**wait を含む書き方はしないこと**
  （このタスクは毎フレーム回るので、`wait` を入れると壁判定が止まる）。
  `writeModifier` が `wait` を出す種別（duration 付き）は、
  wall トリガー時は最終値の一発適用に切り替える（プレビュー側と揃える）。

### 1-5. UI `src/ui/Properties.tsx`

- **弾 (Bullet) グループ**に追加:
  - `壁の挙動` … Select（`しない` / `跳ね返る` / `反対側へ出る` / `消える`）
  - `跳ね返り回数` … bounce / wrap のときだけ表示。NumField、0 は「無制限」と注記
- **モディファイアのカード**に追加:
  - `トリガー` … Select（`経過フレーム` / `壁に当たった時`）
  - `trigger === 'wall'` のとき、`開始F` のラベルを `何回目` に変える
  - wall トリガーのときは `継続F` を隠す（一発適用なので意味がない）

---

## 2. プレイモード（自機を動かす）

### 2-1. 重要な制約 — 決定論を壊さないこと

このエディタは「フレーム N の弾幕は (project, seed, N) の純粋関数」であることを前提に、
60F ごとのスナップショットから巻き戻している（`src/engine/sim.ts`）。
**自機が対話的に動くとこの前提が崩れる**ので、次のルールを必ず守る:

- プレイモード中は**前方向にしか進めない**。シークバー・ルーラーのドラッグ・
  1フレーム戻し・逆再生を無効化する。
- プレイモード開始時に `frame = 0` へ戻し、シミュレータを `invalidate()` する。
- プレイモードを抜けたら通常どおりシーク可能に戻す（そのとき再度 `invalidate()`）。

この制約を UI にも出すこと（プレイ中はシークバーを disabled にするなど）。

### 2-2. 自機位置の供給 `src/engine/sim.ts`

`Simulator` に注入口を足す。`resolveShotId` と同じやり方にする:

```ts
  /**
   * 自機位置の供給元。プレイモードでは実際に動いている自機を返す。
   * 既定はプロジェクト設定の値。
   */
  playerPosition: () => { x: number; y: number } = () => ({
    x: this.compiled.project.settings.playerX,
    y: this.compiled.project.settings.playerY,
  })
```

`spawn()` の `aim` 計算と、`reaim` モディファイアの両方でこれを使うこと
（現状は `settings.playerX/Y` を直接読んでいる）。

### 2-3. ストア `src/store/useStore.ts`

```ts
  playMode: boolean
  /** プレイモード中の自機位置（プロジェクトには保存しない） */
  livePlayer: { x: number; y: number }
  setPlayMode: (v: boolean) => void
  setLivePlayer: (x: number, y: number) => void
```

`setPlayMode(true)` のとき: `frame = 0`, `playing = true`, `reverse = false`,
`livePlayer` を `settings.playerX/Y` で初期化。
`setPlayMode(false)` のとき: `playing = false`。

### 2-4. 入力と移動 `src/ui/Preview.tsx`

- `window` の keydown / keyup で押下中のキーを Set に保持する
  （入力欄にフォーカスがあるときは無視。既存の App.tsx のショートカット処理と同じ判定）
- 対応キー: `ArrowUp/Down/Left/Right` と `KeyW/KeyA/KeyS/KeyD`
- 速度: **4.5 px/frame**、`Shift` 押下中は **1.8 px/frame**（低速移動）
- 斜めは正規化する（`/ Math.sqrt(2)`）
- ステージ矩形内にクランプする
- rAF ループの中で、プレイモード中のみ毎フレーム位置を更新して
  `setLivePlayer` する。**React の再描画を毎フレーム起こさないこと**
  （既存ループと同じく `useStore.getState()` で読み書きし、
  描画はレンダラ側で行う。ストア更新は 1 フレームに 1 回で問題ないが、
  もし重いようなら module スコープの変数に持って renderer へ直接渡してよい）
- `sim.playerPosition` に、プレイモード中は `livePlayer` を返す関数を差し込む

### 2-5. 自機スプライト `src/render/stage.ts`

- 画像: `public/player/reimu.png`（**512 × 256、横8分割 × 縦4分割 = 1コマ 64 × 64px**）
- **使うのは左上の1コマだけ**。矩形は `(0, 0, 64, 64)`。**アニメーションはしない**。
- `setPlayerSprite(image: HTMLCanvasElement | HTMLImageElement | null)` を追加し、
  内部で `Texture` を作って `guideLayer` の上あたりに Sprite を1つ持つ
  （毎フレーム作り直さない。既存のスプライトプールと同じ方針）
- 描画位置は自機座標。`anchor 0.5`。ワールドコンテナが既にステージ倍率で
  スケールされているので、**スプライト側は等倍で置く**（64px がステージ座標の 64 単位）。
  大きすぎるようなら `scale 0.75` 程度まで下げてよい。
- 既存の自機ガイド（円と十字）は**当たり判定の目印として残す**が、
  スプライトの上に小さく描く。
- 画像の読み込みは `src/App.tsx` で行い（既存のショットデータ読み込みと同じ形）、
  ストア経由でレンダラへ渡す。

### 2-6. UI

- `src/ui/TopBar.tsx` に「プレイ」トグルボタンを追加（狭い画面版にも入れる）
- プレイモード中は `src/ui/Timeline.tsx` のルーラードラッグと
  `Transport` 相当のシーク操作を無効化
- プレイ中は画面のどこかに小さく操作説明を出す:
  `矢印キー / WASD で移動・Shift でゆっくり`

---

## 3. 検証（必須）

実装後、**ブラウザで実際に動かして数値で確認**すること。
`npm run dev --prefix danmaku-studio` → http://localhost:5183

確認する内容:

1. **跳ね返り** — `wallBehavior='bounce'` の弾を1発だけ斜めに撃ち、
   ステージ端に達したフレームで角度が反転し、位置がステージ内に留まることを
   フレームごとの数値で確認する。
2. **回数制限** — `wallBounces=2` で3回目の接触時に弾が消えることを確認。
3. **wrap** — 端に達した瞬間に反対側へ座標が飛ぶことを確認。
4. **壁トリガー** — `trigger='wall'`, `at=1` の `graphic` モディファイアで、
   1回目の接触後に `shotId` が変わることを確認。
5. **ph3 出力** — 上記それぞれで `TWall…` タスクが出力され、
   `undefined` / `NaN` が混入していないことを確認。
6. **プレイモード** — 自機がキー入力で動き、`aimPlayer` のパターンが
   その位置を狙うこと。プレイ中にシークが無効化されていること。
7. **既存機能の非破壊** — サンプル13本すべてがこれまでどおり読み込め、
   ph3 出力が通ること。

検証は `mcp__Claude_Browser__javascript_tool` で
`await import('/src/engine/sim.ts')` などを使って直接数値を取るのが速い。
**「実装した」だけで終わらせず、必ず数値で裏を取ってから完了報告すること。**

---

## 4. やらないこと

- 自機の当たり判定・被弾処理（今回は移動だけ）
- 自機のアニメーション（左上1コマ固定）
- ショット発射などのゲーム要素
- `.dmk` のバージョン変更
