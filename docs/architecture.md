# アーキテクチャ

この文書は、組子グリッドの長寿命な技術設計を定義する正本とする。個別機能の実装予定や進捗はGitHub Issueで管理する。

## 1. 設計原則

- Cell PatternとLayoutを独立させる。
- geometry、pattern、layoutのドメインロジックをReact UIから分離する。
- 幾何学計算は可能な限りpure functionとして実装する。
- 永続データには意味のある相対表現を保持し、描画座標は導出する。
- 派生Geometryとユーザーが入力した元データを区別する。
- 将来拡張のためだけに過剰な抽象化を導入しない。

## 2. モジュール境界

基本構成:

```text
src/
  geometry/
  pattern/
  layout/
  export/
  components/
  app/
```

### geometry

正三角形、Point、AnchorPointの座標解決、Segment、鏡映、回転、交差判定など、UIに依存しない幾何計算を担当する。

### pattern

Cell Patternのモデルと、Symmetry等による派生Segment生成を担当する。

### layout

Cell Patternをどこへどの向きで配置するかを担当する。Layout StrategyはCell Patternの内容を知らない。

### export

描画と共通のGeometryからSVG等の出力データを生成する。

### components

表示とユーザー操作を担当する。幾何学の数式や座標変換ルールはここへ直接実装しない。

### app

アプリケーション状態と各コンポーネントの接続を担当する。

## 3. 基本データモデル

### Point

計算結果として利用するCartesian座標。

```ts
interface Point {
  x: number
  y: number
}
```

Pointは描画・計算用であり、ユーザーが定義するAnchorPointの永続表現そのものではない。

### Triangle

基準Cellの3頂点を持つ。

正規化した上向き正三角形を基準とする。

- A = (0.5, 0)
- B = (0, sqrt(3) / 2)
- C = (1, sqrt(3) / 2)

### AnchorPoint

頂点を表す `vertex` と、辺上のn等分点を表す `edge-division` のdiscriminated unionを基本とする。

Edge Division Pointは座標を保存せず、edge、divisions、indexから解決する。

### Segment

安定したIDと始点・終点のAnchorPointを持つ。

同一AnchorPointを始点・終点に持つ退化Segmentは基本入力として作成しない。

### CellPattern

ユーザーが定義した基本Segment群とSymmetry等の設定を持つ。

対称展開されたSegmentは基本Segment配列へ複製せず、表示・出力時の派生データとして扱う。

### CellPlacement

基準CellのLocal CoordinateをPreview座標へ写す配置情報を表す。

少なくとも位置、回転、必要に応じてmirrorを表現できること。

## 4. 座標と変換

Edge Division Pointは辺の始点から終点への線形補間で求める。

mirrorは選択した頂点と対辺中点を結ぶ中線に対して両端点を鏡映する。

rotationalは正三角形の重心を中心として120°、240°回転する。

下向きCellでもAnchorPoint自体の意味は変えない。基準CellのLocal Coordinateを配置変換して向きを表現する。

基準三角形の外接矩形高さを `height` とした場合、下向きCellへの基本変換は概念的に次で表現できる。

```text
(x, y) -> (1 - x, height - y)
```

その後、必要な拡大・平行移動を適用する。

## 5. Layout Strategy

Layout StrategyはCell Patternから独立した配置生成規則とする。

MVPの `triangular-grid` は、行・列に応じて上向き / 下向きのCellを配置する。

将来別のLayout Strategyを追加しても、Cell Patternのモデルへ配置固有ロジックを持ち込まない。

## 6. UIとの境界

Reactはdivision数、選択中AnchorPoint、基本Segment群、Symmetry等の操作状態を所有してよい。

コンポーネントは計算済みモデルとcallbackを受け取り、次の処理をドメイン層へ委譲する。

- AnchorPointから座標への解決
- mirror / rotational変換
- Cell配置
- 交差判定
- SVG出力用Geometry生成

## 7. 派生Geometry

次のようなデータは、原則として元データから導出する。

- Symmetryによる生成Segment
- Layout展開後のSegment
- 将来の境界線
- 交差による描画Fragment
- SVG出力時の正規化済みSegment

派生Geometry上の完全重複は、ユーザー入力の不正とは分けて扱う。必要に応じて描画・出力段階で正規化する。

## 8. テスト設計

geometry / pattern / layoutはReactなしでUnit Test可能にする。

浮動小数点Geometryは完全一致ではなく適切な許容誤差を使用する。

テストは内部実装の形ではなく、仕様として維持する振る舞いと不変条件を対象にする。

## 9. 永続化とスキーマ

保存形式を導入する場合、ドキュメント全体に1つの `schemaVersion` を持たせる方針とする。

Cell Pattern / Layoutごとのサブスキーマversionは原則として持たない。具体的な保存形式・migrationは対応するGitHub Issueで設計する。

Generatorのアルゴリズムversionは保存スキーマversionとは別概念として扱う。

## 10. 設計変更の記録

プロダクト上の意味や振る舞いを変える場合は `docs/spec.md` を更新する。

モジュール境界、座標系、永続モデルなど長寿命な技術設計を変える場合はこの文書を更新する。

将来実施する個別作業や調査事項はGitHub Issueへ記録する。
