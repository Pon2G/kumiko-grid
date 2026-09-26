# Kumiko Grid MVP アーキテクチャ・実装計画

## 1. 要件とスコープ

MVPは、正規化された正三角形Cell内に線分を定義し、通常の三角形平面充填としてPreviewするResponsiveなReactアプリケーションとする。CellPatternとLayoutStrategyは独立させる。geometryは画面座標ではなく相対的なAnchorPointで表現し、すべての座標計算をUIに依存しないpure functionとする。

最初の実装マイルストーンでは、geometryモデル、辺のn等分AnchorPoint、Segment作成、`none` / `mirror` / `rotational`対称、Cell Editor、`triangular-grid` Pattern Preview、Responsive UI、Unit Testを対象とする。Intersection PointおよびREADMEの「MVPで実装しないもの」は対象外とする。SVG保存、Preview範囲・線幅の変更、GitHub Pagesへのデプロイは後続マイルストーンで実装する。

## 2. データモデル

- `Point`: 計算結果の描画座標にだけ用いる正規化Cartesian座標 `{ x, y }`。
- `Triangle`: `A`、`B`、`C`の3頂点。基準Cellは一辺の長さが1の上向き正三角形。
- `AnchorPoint`: 頂点を表す`vertex`と、`edge`、`divisions`、`index`で識別する`edge-division`のdiscriminated union。座標値は保存しない。
- `Segment`: 安定した`id`と、始点・終点のAnchorPoint。
- `Symmetry`: `none`、3本の「頂点から対辺中点」軸のいずれかを使う`mirror`、重心を中心とする`rotational`。
- `RenderedSegment`: SegmentとSymmetryから元のPatternを変更せず導出する、始点・終点座標とsource/generated情報。
- `CellPattern`: 種となるSegment群と選択中のSymmetry。
- `CellPlacement`: 基準CellのローカルgeometryをPreview座標へ写す平行移動と回転。

## 3. モジュール構成

```text
src/
  geometry/     基準正三角形、AnchorPoint、Segment、Point変換
  pattern/      CellPatternモデルとSymmetry展開
  layout/       LayoutStrategy型とtriangular-grid生成
  components/   Settings、CellEditor、PatternPreview
  app/          アプリケーション状態と画面構成
```

Reactはdivision数、選択中AnchorPoint、種Segment群、Symmetryを操作状態として所有する。コンポーネントは計算済みモデルとcallbackを受け取り、幾何学の数式を実装しない。描画にはSVGを使い、geometryモジュールはUnit Testおよび将来のSVG保存でも再利用できる座標を返す。

## 4. 座標と変換

基準正三角形は`A = (0.5, 0)`、`B = (0, sqrt(3)/2)`、`C = (1, sqrt(3)/2)`とする。Edge Division Pointは、辺名の最初の端点から次の端点への線形補間で求める。mirrorは選択した中線に対して両端点を鏡映し、rotationalは重心を中心として両端点を120°、240°回転する。

triangular-gridは、一辺の半分ずつ水平方向へずらしたCellを行ごとに生成し、行と列の偶奇で向きを交互にする。上向きCellは基準ローカル座標を維持する。下向きCellは、基準正三角形の外接矩形中央を中心とする180°回転に相当する`(x, y) → (1 - x, height - y)`を適用してから、拡大・平行移動する。AnchorPointの意味を変えずに向きだけを配置変換で表現する。

## 5. マイルストーン

### マイルストーン1 — 基盤とgeometry（今回）

1. Vite、React、TypeScript、Vitestでプロジェクトを初期化する。
2. 基準正三角形、辺の補間、AnchorPoint解決、Segment補助関数、鏡映、回転をpure functionとして実装する。
3. source/generatedを区別できるSymmetry展開を実装する。
4. `LayoutStrategy`と通常のtriangular-grid配置・ローカル座標変換を実装する。
5. n等分座標、mirror、回転、上向き・下向き変換、grid配置、SVG描画用座標をUnit Testする。

### マイルストーン2 — EditorとPreview（今回）

1. division数、Symmetry、mirror軸を変更するSettingsを実装する。
2. 広いAnchorPointタップ領域、2点選択、選択中表示、種・生成Segmentの視覚的区別、種Segment削除を備えたSVG Cell Editorを実装する。
3. 同じCellPatternをtriangular-grid LayoutStrategyで即時描画する独立したPattern Previewを実装する。
4. PC・スマートフォンの配置を確認し、READMEの実装状況を更新する。

### マイルストーン3 — 残りのMVP操作とSVG保存（今後）

1. Preview範囲と線幅の設定を追加する。
2. 共通geometryから、実寸指定への拡張と重複Segment処理を考慮した正しいSVGを生成・保存する。
3. SVG保存に関するUnit Testを追加する。

### マイルストーン4 — 配信（今後）

1. GitHub Pages workflowとproduction用base path設定を追加する。
2. Test・Build・Responsive UIの最終確認を行い、Definition of Doneを更新する。

## 6. 検証

- 浮動小数点geometryは許容誤差を使って検証し、READMEで要求された最低限のTest項目を網羅する。
- `npm test`が非対話的に成功すること。
- `npm run build`によるTypeScript検査とVite buildが成功すること。
- Segmentの作成・削除、各Symmetry、Previewの即時反映、Responsiveな縦並びをUIで確認する。

## 7. 仮定と制約

- division数はタップ可能な間隔を保つため2〜12とし、頂点は別のAnchorPointとして選択できる。Edge Division Pointの`index`は端点を除く1以上`divisions`未満とする。
- 同じAnchorPointを2回選ぶ退化Segmentは追加しない。
- Symmetryによる生成Segmentは表示専用とし、個別の選択・削除はできない。ユーザーは種Segmentを編集する。
- 完全に重なるSegmentの除去はSVG保存と同時に扱うため、今回のマイルストーンでは保持する。
- Intersection Point、永続化、import/export、undo/redo、別Layout、加工固有設定は追加しない。
