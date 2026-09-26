# プロダクト仕様

この文書は、組子グリッドの現在のユーザー向け振る舞いとドメイン上の意味を定義する正本とする。

未実装の機能候補や今後の作業一覧はここへ記載せず、GitHub Issueで管理する。

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

現在のAnchorPointは `Vertex` と `Edge Division Point` で構成する。

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

線分同士の交点は現在のAnchorPointとして扱わない。

## 4. Segment

Cell Patternは複数の `Segment` から構成される。

最低限、Segmentは安定したIDと始点・終点のAnchorPointを持つ。

現在、Segment同士の交差によってSegment定義そのものを変更しない。

## 5. Cell Pattern

Cell Patternは、ユーザーが定義した基本Segmentと、それに適用するSymmetryから構成する。

対称形の場合でも、生成後のすべてのSegmentをユーザー入力として保持しない。ユーザーは基本Segmentを定義し、残りは対称操作から派生生成する。

### 5.1 Symmetry

現在は次を扱う。

#### none

対称操作なし。ユーザーが指定した基本Segmentだけを描画する。

#### mirror

線対称。

正三角形の「頂点 → 対辺の中点」を結ぶ3本の軸から1本を選択し、基本Segmentを鏡映して追加する。

#### rotational

正三角形の重心を中心とする120度回転対称。

基本Segmentを0°、120°、240°へ回転して配置する。

## 6. Cell Editor

1つの正三角形を編集する画面を持つ。

表示対象:

- 正三角形
- 頂点
- 各辺のn等分点
- ユーザーが入力した基本Segment
- 対称操作によって生成されたSegment

Cell Editorでは、ユーザーが入力した基本Segmentと対称操作によって生成されたSegmentを視覚的に区別する。

基本操作:

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

現在は通常の正三角形平面充填を扱い、上向き三角形と下向き三角形を組み合わせて表示する。

下向きセルへCell Patternを配置するときは、画面座標の単純コピーではなく、セル自身のLocal Coordinateから配置変換する。

## 8. Layout

LayoutはCell Patternから独立した概念とする。

Cellの配置結果は、少なくとも位置、回転、必要に応じてmirror情報を表現できること。

現在のLayout Strategyは `triangular-grid` とする。

## 9. UI

PCとスマートフォンの両方で利用できるWebアプリとする。

PCではSettings、Cell Editor、Pattern Previewを同時に確認しやすい配置を基本とする。スマートフォンでは縦並びとしてよい。

## 10. 仕様と将来候補の境界

この文書には現在採用している仕様を記録する。

現在存在しない機能、追加する可能性がある機能、実装するか未定のアイデアはGitHub Issueへ記録する。

将来候補の存在が現在のアーキテクチャ判断へ影響する場合でも、候補一覧をこの文書へ複製せず、`design-context` ラベル付きIssueと `docs/architecture.md` の設計原則で扱う。
