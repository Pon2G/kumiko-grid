組子グリッド

正三角形を基本セルとして、その内部に幾何学的な線分パターンを定義し、正三角形グリッド上に敷き詰めて文様を生成するWebアプリ。

最終的には、レーザーカッターで加工可能なSVGを生成し、組子・幾何学文様・オリジナルパターンの設計に利用することを目指す。

1. コンセプト

このアプリでは、文様を次の2つの独立した要素として扱う。

1. Cell Pattern
   - 1つの正三角形内部に存在する線分パターン
2. Layout / Tiling
   - Cell Patternを持つ正三角形を、どの向き・順番で配置するか

Cell PatternとLayoutを分離することで、同じ三角形内部パターンを異なる敷き詰め方に適用できるようにする。

---

2. 基本セル

基本セルは正三角形とする。

頂点を以下のように定義する。

- A
- B
- C

辺は以下。

- AB
- BC
- CA

内部計算では任意の正規化座標系を使用してよい。

ユーザーが模様を定義するときは、原則としてmm等の絶対座標を指定しない。

---

3. Anchor Point

線分の始点・終点として利用できる点を "AnchorPoint" とする。

3.1 Vertex

正三角形の頂点。

例:

- A
- B
- C

3.2 Edge Division Point

辺をn等分した点。

以下の情報によって表現する。

- edge
- divisions
- index

例:

"BCを5等分した2番目の点"

edge = BC
divisions = 5
index = 2

座標値そのものは保存せず、この相対的な表現から座標を計算する。

これにより、三角形のサイズを変更しても同じ文様を維持できる。

3.3 Intersection Point

将来拡張。

既存線分同士の交点をAnchor Pointとして利用できるようにする。

MVPでは未実装でよい。

---

4. Segment

Cell Patternは複数の線分 "Segment" から構成される。

最低限、以下を持つ。

interface Segment {
  id: string
  start: AnchorPoint
  end: AnchorPoint
}

将来的には以下を追加する。

intersectionBehavior:
  | "pass"
  | "stop"
  | "split"

意味:

- "pass"
  - 他の線分との交点を無視して通過する
- "stop"
  - 最初の交点で終了する
- "split"
  - 交点で線分を分割する

MVPでは、すべて "pass" 相当として扱ってよい。

---

5. Cell Pattern

Cell Patternは、ユーザーが定義した「基本線分」と、それに対して適用する変換から構成する。

重要:

対称形の場合でも、生成後のすべての線分をユーザーに入力させない。

ユーザーは「種となる線分」を入力し、対称操作によって残りを自動生成する。

5.1 Symmetry

MVPでは次の3種類を扱う。

none

対称操作なし。

ユーザーが指定した線分だけを描画する。

mirror

線対称。

正三角形の

"頂点 → 対辺の中点"

を結ぶ3本の軸から1本を選択する。

ユーザーの基本線分を鏡映して追加する。

rotational

正三角形の重心を中心とする120度回転対称。

基本線分を

- 0°
- 120°
- 240°

に回転して配置する。

---

点対称について

180度回転による通常の点対称は、単一の正三角形をそれ自身に写さない。

そのためMVPではCell Patternの対称性として扱わない。

将来的に、

- 三角形2枚
- 菱形
- 正六角形
- 複数セルからなるMotif

を基本単位として扱えるようになった段階で180度点対称を追加する。

---

6. Cell Editor

画面上で1つの正三角形を編集できるようにする。

表示

- 正三角形
- 頂点
- 各辺のn等分点
- ユーザーが入力した基本線分
- 対称操作によって生成された線分

基本線分と自動生成線分は、編集時には視覚的に区別できることが望ましい。

SVG出力時には区別する必要はない。

操作

MVPでは次の操作を可能にする。

1. "n" を指定する
2. Anchor Pointをクリックする
3. もう1つのAnchor Pointをクリックする
4. 2点を結ぶSegmentを追加する
5. Segmentを選択して削除する
6. symmetryを変更する
7. mirrorの場合は対称軸を変更する

スマートフォンでは、Anchor Pointを十分大きなタップ領域として扱う。

---

7. Preview

Cell Editorとは別に、文様全体を表示するPreview領域を持つ。

Cell Patternを変更すると即座にPreviewへ反映する。

MVPでは通常の三角形平面充填を実装する。

△▽△▽△▽
▽△▽△▽△
△▽△▽△▽

上向き三角形と下向き三角形を組み合わせ、指定範囲を埋める。

重要:

下向きセルにCell Patternを配置するときは、単純に画面座標をコピーするのではなく、セル自身のLocal Coordinateから適切な座標変換を行うこと。

---

8. Layout Strategy

LayoutはCell Patternから独立したモジュールとして実装する。

例えば以下のinterfaceを想定する。

interface CellPlacement {
  position: Point
  rotation: number
  mirrored?: boolean
}

interface LayoutStrategy {
  generate(...): CellPlacement[]
}

MVPでは以下のみ実装する。

triangular-grid

正三角形による通常の平面充填。

---

9. 将来のLayout

以下はMVPでは実装しないが、設計上追加可能にしておく。

radial-hex

ある一点を中心としてCellを60度ずつ回転配置する。

6個の三角形によって正六角形状のユニットを形成できる。

strip

三角形を左右交互に倒しながら帯状に配置する。

例:

△▽△▽△▽△▽

path

三角格子上を進む「経路」としてCellを配置する。

基本的には左右交互に三角形を倒すことで直進する。

同じ方向へ連続して倒すことで進行方向を60度変更できる。

将来的には例えば以下のような命令列で表現可能にする。

L R L R

直進。

L L

60度旋回。

R R

反対方向へ60度旋回。

正確な命令体系は実装時に再検討する。

---

10. SVG Export

生成した文様をSVGとして保存できるようにする。

SVGは将来的なレーザー加工を想定する。

要件

- SVGとして正しいこと
- viewBoxを持つこと
- 出力サイズを指定できる設計にすること
- mm単位での実寸出力に拡張可能であること
- 同一位置に完全に重なる線分を可能な範囲で除去できる設計にすること

MVPでは表示用SVGと同じGeometryからファイルを生成する。

将来的には、

- CUT
- ENGRAVE
- GUIDE

などの加工用途別レイヤーを持たせる。

---

11. UI

PCとスマートフォンの両方で利用できるWebアプリとする。

PCでは以下を基本レイアウトとする。

+----------------+------------------------+
|                |                        |
| Settings       | Cell Editor            |
|                |                        |
|                +------------------------+
|                |                        |
|                | Pattern Preview        |
|                |                        |
+----------------+------------------------+

スマートフォンでは縦並びにしてよい。

Settings
↓
Cell Editor
↓
Pattern Preview

---

12. MVP

最初のリリースで実装するもの。

- React
- TypeScript
- Vite
- SVGによる描画
- 正三角形Cell
- 辺のn等分点
- Anchor Pointクリックによる線分追加
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

---

13. MVPで実装しないもの

以下は意図的に後回しにする。

- 線分交点のAnchor Point化
- 交点で停止
- 交点で分割
- 交点を突き抜ける設定
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

---

14. Architecture

幾何計算とReact UIを可能な限り分離する。

推奨構成:

src/
  geometry/
    triangle.ts
    anchorPoint.ts
    segment.ts
    transform.ts
    intersections.ts

  pattern/
    cellPattern.ts
    symmetry.ts

  layout/
    types.ts
    triangularGrid.ts

  export/
    svg.ts

  components/
    CellEditor/
    PatternPreview/
    Settings/

  app/

Geometry層は可能な限りpure functionで実装する。

React component内部へ座標計算ロジックを直接書かない。

---

15. Tests

最低限以下をUnit Testする。

- n等分点の座標計算
- mirror変換
- 120度回転
- triangle up/downの座標変換
- triangular-gridのCell配置
- SVG用座標生成

GeometryロジックはUIに依存せずテスト可能にする。

---

16. Development Principles

優先順位:

1. 幾何学的に正しいこと
2. コード上の内部モデルが明確であること
3. 操作していて楽しいこと
4. レーザー加工への将来拡張性
5. 見た目の装飾

過剰な抽象化は避ける。

将来機能のためだけの大規模なframeworkは導入しない。

ただし、

"Cell Pattern"

と

"Layout Strategy"

の分離は必ず維持する。

---

17. Definition of Done — MVP

以下をすべて満たした状態をMVP完成とする。

- GitHub Pagesでアプリを開ける
- スマートフォンから操作できる
- 正三角形が表示される
- nを変更すると辺上の選択点が変わる
- 2点を選択すると線分が作られる
- 線対称を選択すると線分が自動生成される
- 回転対称を選択すると120°・240°の線分が生成される
- 作成したCell Patternが三角格子として敷き詰め表示される
- Cell Patternを編集するとPreviewが即座に変わる
- SVGを保存できる
- "npm test" が成功する
- "npm run build" が成功する
- mainへのpushでGitHub Pagesが更新される

---

18. Implementation Process for Codex

実装前にこのREADME全体を読むこと。

最初にコードを書き始めず、

1. 要件を確認
2. データモデルを設計
3. "PLAN.md" を作成
4. MVPを複数の小さなMilestoneに分割
5. 不明点があっても、MVPの範囲内で合理的な仮定を置く
6. 実装
7. Unit Test
8. Build
9. UIの確認
10. READMEの実装状況を更新

の順で作業する。

READMEに明記されていない便利機能を大量に追加しない。

まずMVPを完成させる。

---

19. Implementation Status

現在、MVPの最初の実装マイルストーンとして以下を実装済み。

- React + TypeScript + Viteのプロジェクト基盤
- 正三角形、辺のn等分点、AnchorPoint、Segmentのgeometryモデル
- none / mirror / rotationalの対称変換
- AnchorPoint選択とSegment削除が可能なCell Editor
- triangular-grid Layout StrategyによるPattern Preview
- geometry / pattern / layoutのUnit Test
- PC / スマートフォン向けResponsive UI

SVG保存、Preview範囲・線幅の変更、GitHub Pagesへの自動デプロイは、後続のMVPマイルストーンで実装予定。
