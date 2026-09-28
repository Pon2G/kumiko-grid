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

<!-- test-contract: SPEC-ANCHOR-EDGE-DIVISION-COORDINATE -->
座標値そのものは保存せず、edgeの始点から終点へ `index / divisions` の割合で線形補間し、相対表現から座標を計算する。これにより三角形の表示サイズが変わっても同じ文様を維持できる。

線分同士の交点は現在のAnchorPointとして扱わない。

## 4. Segment

Cell Patternは複数の `Segment` から構成される。

最低限、Segmentは安定したIDと始点・終点のAnchorPointを持つ。

現在、Segment同士の交差によってSegment定義そのものを変更しない。

## 5. Cell Pattern

Cell Patternは、ユーザーが定義した基本Segment、それに適用するSymmetry、基本Segment間のsplit relationから構成する。

対称形の場合でも、生成後のすべてのSegmentをユーザー入力として保持しない。ユーザーは基本Segmentを定義し、残りは対称操作から派生生成する。

### 5.1 Symmetry

現在は次を扱う。

#### none

対称操作なし。ユーザーが指定した基本Segmentだけを描画する。

#### mirror

線対称。

<!-- test-contract: SPEC-SYMMETRY-MIRROR -->
正三角形の「頂点 → 対辺の中点」を結ぶ3本の軸から1本を選択し、基本Segmentを鏡映して追加する。

#### rotational

<!-- test-contract: SPEC-SYMMETRY-ROTATIONAL -->
正三角形の重心を中心とする120度回転対称。

基本Segmentを0°、120°、240°へ回転して配置する。

<!-- test-contract: SPEC-SYMMETRY-EXPANSION -->
1本の基本Segmentに対し、`none` は元の1本、`mirror` は元と鏡映の2本、`rotational` は0°、120°、240°の3本を描画用Segmentとして生成する。元のSegmentはユーザー入力として扱う。

### 5.2 交点でのsplit

<!-- test-contract: SPEC-PATTERN-SEGMENT-SPLIT -->
交点はAnchorPointではなく、現在のSegment・Symmetry・split relationから再計算する派生Geometryである。splitは基本Segmentを破壊的に置換しない。ユーザーはSymmetry展開後の具体的なSegment instance同士の交点を分割対象として選べるが、Cell Patternへ保持する `SplitRelation` はその1 pairそのものではなく、target source Segment、cutter source Segment、およびtarget instanceからcutter instanceへの相対transformで表した**対称軌道**とする。

現在のSymmetryに対する相対transformは、`none` では `identity`、`mirror` では `identity / mirror`、`rotational` では `identity / rotation +1 / rotation +2` を扱う。同じ対称軌道に属するどの具体pairから操作しても同じ `SplitRelation` へ正規化し、同じrelationを重複保持しない。relationは交点座標、Segment parameter、候補表示用情報、操作時に選ばれた代表instance pairを保持しない。

relationは有向であり、対称軌道内のtarget側instanceだけを分割する。双方を分割するには逆向きのrelationも必要とする。逆向きrelationでは相対transformも逆向きとなり、rotationalの `+1` と `+2` は互いに逆、mirrorは自身が逆、identityは自身が逆となる。

relationから導出される対称軌道の**すべての具体pair**がsplit可能な場合だけ、そのrelationをCell Patternへ保持できる。split可能とは、交差が `cross` または `touch` であり、その交点がtarget instanceの内部に位置することをいう。有限長の `overlap` はsplitしない。同一のSegment instance自身との比較もsplit対象外とする。同一source Segment間でもnon-identityの相対transformによって異なるinstance同士を参照するrelationは許可するが、同一sourceの `identity` relationは許可しない。対称軌道の一部だけをrelationとして保持することはしない。

<!-- test-contract: SPEC-PATTERN-SPLIT-SYMMETRY-CHANGE -->
Cell Patternは現在の設計Geometry上で有効なSplitRelationだけを保持する。Symmetryを変更するときは、まず新しいSymmetryでも同じ意味を持つ相対transformだけを引き継ぎ候補とし、その後、新しいSymmetryから対称軌道を再展開してsplit可能性を再検証する。新しいSymmetryで表現できないrelation、または再検証後に有効なsplitを形成しないrelationは削除する。現在効いていないrelationを将来の復活用データとして保持しない。

`identity` relationは `none / mirror / rotational` の間で引き継ぎ候補となる。mirrorの `mirror` relationはmirror軸を変更しても意味上は引き継ぎ候補とし、新しい軸で具体pairを再展開・再検証する。mirrorとrotationalの間では、non-identity relationを別種類の相対transformへ自動変換しない。

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
8. 基本Segmentを分割対象として選び、現在のSymmetryで成立する対称軌道単位の有向split relationを追加または解除する

<!-- test-contract: SPEC-EDITOR-SPLIT-CANDIDATES -->
交点候補は分割対象を選択している間だけ、その時点のPatternから正規化されたSplitRelation候補として導出して表示する。1つのcandidateは1つの対称軌道を表し、candidate一覧ではrelationを1件として扱う。relationから展開された具体pairの交点は表示用の派生情報であり、同じrelation内でGeometry上同一点となる座標は重複表示を避けてよい。一方、異なるSplitRelationが同じ座標に交点を持っていてもrelation自体を統合しない。座標はrelation identityではない。

SVG上の交点マーカーはsplit位置を示す表示専用の派生情報とし、Cell Patternへ保存しない。分割対象の選択、候補、候補座標も操作中だけのUI状態とする。relationの追加・解除はcandidateが表す対称軌道全体を1操作単位とし、同じ軌道に属する別の具体pairを基準にしても同じrelationとして扱う。

スマートフォンではAnchorPointを十分大きなタップ領域として扱う。

## 7. Preview

Cell Editorとは別に文様全体を表示するPreview領域を持つ。

Cell Patternを変更するとPreviewへ即時反映する。

<!-- test-contract: SPEC-LAYOUT-TRIANGULAR-GRID -->
現在は通常の正三角形平面充填を扱い、上向き三角形と下向き三角形を交互に組み合わせ、指定した行数と列数のCellを表示する。

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
