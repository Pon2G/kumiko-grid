# プロダクト仕様

この文書は、組子グリッドのユーザー向け振る舞いとドメイン上の意味を定義する正本とする。

## 1. 基本コンセプト

文様を次の2要素へ分離する。

1. Cell Pattern
   - 1つの正三角形内部に存在する線分パターン
2. Layout
   - Cell Patternを持つ正三角形を、どの向き・順番で配置するか

同じCell Patternを異なるLayoutへ適用できることを前提とする。

## 2. 基本セル

基本セルは正三角形とする。

頂点は `A`、`B`、`C` とし、辺は `AB`、`BC`、`CA` とする。

内部計算では正規化座標系を利用してよい。ユーザーが文様を定義するときは、原則としてmm等の絶対座標を直接指定しない。

## 3. AnchorPoint

線分の始点・終点として利用できる点を `AnchorPoint` とする。

### 3.1 Vertex

正三角形の頂点 `A`、`B`、`C`。

### 3.2 Edge Division Point

辺をn等分した内部点。

少なくとも次の情報で表現する。

- edge
- divisions
- index

例として「BCを5等分した2番目の点」は `edge = BC`、`divisions = 5`、`index = 2` と表現する。

座標値そのものは保存せず、相対表現から座標を計算する。これにより三角形の表示サイズが変わっても同じ文様を維持できる。

### 3.3 Intersection Point

将来拡張とする。

線分同士の交点をAnchorPointとして永続的に参照する機能は、現時点のMVPには含めない。

## 4. Segment

Cell Patternは複数の `Segment` から構成される。

最低限、Segmentは安定したIDと始点・終点のAnchorPointを持つ。

将来的な交点処理として、通過・停止・分割などの振る舞いを追加できる設計を考慮する。ただしMVPではすべて交点を無視して通過するものとして扱う。

## 5. Cell Pattern

Cell Patternは、ユーザーが定義した種となるSegmentと、それに適用する変換から構成する。

対称形の場合でも、生成後のすべてのSegmentをユーザー入力として保持しない。ユーザーは基本Segmentを定義し、残りは対称操作から派生生成する。

### 5.1 Symmetry

MVPでは次を扱う。

#### none

対称操作なし。ユーザーが指定した基本Segmentだけを描画する。

#### mirror

線対称。

正三角形の「頂点 → 対辺の中点」を結ぶ3本の軸から1本を選択し、基本Segmentを鏡映して追加する。

#### rotational

正三角形の重心を中心とする120度回転対称。

基本Segmentを0°、120°、240°へ回転して配置する。

### 5.2 180度点対称

180度回転は単一の正三角形をそれ自身へ写さないため、MVPのCell Patternの対称性として扱わない。

三角形2枚、菱形、正六角形、複数セルからなるMotifなどを基本単位として扱う必要が生じた段階で再検討する。

## 6. Cell Editor

1つの正三角形を編集する画面を持つ。

表示対象:

- 正三角形
- 頂点
- 各辺のn等分点
- ユーザーが入力した基本Segment
- 対称操作によって生成されたSegment

編集時には基本Segmentと派生Segmentを視覚的に区別できることが望ましい。SVG出力では区別する必要はない。

MVPの基本操作:

1. nを指定する
2. AnchorPointをクリックする
3. もう1つのAnchorPointをクリックする
4. 2点を結ぶSegmentを追加する
5. Segmentを選択して削除する
6. symmetryを変更する
7. mirrorの場合は対称軸を変更する

スマートフォンではAnchorPointを十分大きなタップ領域として扱う。

## 7. Preview

Cell Editorとは別に文様全体を表示するPreview領域を持つ。

Cell Patternを変更するとPreviewへ即時反映する。

MVPでは通常の正三角形平面充填を扱い、上向き三角形と下向き三角形を組み合わせて指定範囲を埋める。

下向きセルへCell Patternを配置するときは、画面座標の単純コピーではなく、セル自身のLocal Coordinateから配置変換する。

## 8. Layout

LayoutはCell Patternから独立した概念とする。

Cellの配置結果は、少なくとも位置、回転、必要に応じてmirror情報を表現できること。

MVPでは `triangular-grid` を扱う。

## 9. 将来のLayout

設計上、次のようなLayoutを追加可能にしておく。

- radial-hex
- strip
- path

具体的な命令体系やパラメータは実装時に改めて設計する。

## 10. SVG Export

生成した文様をSVGとして保存できるようにする。

要件:

- 正しいSVGであること
- viewBoxを持つこと
- 出力サイズを指定できる設計であること
- mm単位の実寸出力へ拡張可能であること
- 同一位置に完全に重なる線分を可能な範囲で除去できる設計であること

表示用SVGと保存用SVGは同じGeometryを利用する。

将来的にはCUT、ENGRAVE、GUIDEなど加工用途別レイヤーを持てるようにする。

## 11. UI

PCとスマートフォンの両方で利用できるWebアプリとする。

PCではSettings、Cell Editor、Pattern Previewを同時に確認しやすい配置を基本とする。スマートフォンでは縦並びとしてよい。

## 12. MVP範囲

MVPで対象とするもの:

- React
- TypeScript
- Vite
- SVGによる描画
- 正三角形Cell
- 辺のn等分点
- AnchorPointクリックによるSegment追加
- Segment削除
- none対称
- mirror対称
- 120度rotational対称
- 通常の三角形グリッドPreview
- Preview範囲変更
- 線幅変更
- SVG保存
- Responsive UI
- GitHub Pagesへの自動デプロイ
- 基本的なUnit Test

## 13. MVPで扱わないもの

- 線分交点のAnchorPoint化
- 交点で停止
- 交点で分割
- 交点を突き抜ける個別設定
- radial-hex layout
- strip layout
- path layout
- 点対称Motif
- 複数CellからなるMotif
- undo / redo
- デザイン保存
- JSON import/export
- レーザーカッター固有設定
- kerf補正
- DXF出力

これらの追加・変更はGitHub Issueで個別に管理する。

## 14. テスト対象となる主要仕様

最低限、次のドメイン上の振る舞いをUnit Test可能にする。

- n等分点の座標計算
- mirror変換
- 120度回転
- triangle up/downの座標変換
- triangular-gridのCell配置
- SVG用座標生成

テストは現在の偶然の実装状態ではなく、仕様として維持する振る舞いを固定するために用いる。

## 15. 開発上の優先順位

1. 幾何学的に正しいこと
2. コード上の内部モデルが明確であること
3. 操作していて楽しいこと
4. レーザー加工への将来拡張性
5. 見た目の装飾

過剰な抽象化や、将来機能だけのための大規模なframework導入は避ける。ただしCell PatternとLayoutの分離は維持する。

## 16. MVPのDefinition of Done

- GitHub Pagesでアプリを開ける
- スマートフォンから操作できる
- 正三角形が表示される
- nを変更すると辺上の選択点が変わる
- 2点を選択するとSegmentが作られる
- 線対称を選択するとSegmentが自動生成される
- 回転対称を選択すると120°・240°のSegmentが生成される
- 作成したCell Patternが三角格子として敷き詰め表示される
- Cell Patternを編集するとPreviewが即座に変わる
- SVGを保存できる
- `npm test` が成功する
- `npm run build` が成功する
- mainへのpushでGitHub Pagesが更新される
