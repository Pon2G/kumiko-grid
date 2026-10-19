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

## 3. Anchor

Anchorは、Cell Pattern内の論理的な点を表す参照であり、座標そのものではない。

現在扱うAnchorは次の3種類とする。

- Vertex
- Edge Division Point
- IntersectionAnchor

source Segmentの新規作成・端点変更ではVertex、Edge Division Point、IntersectionAnchorを指定できる。交点端点の選択・追従・喪失は[交点端点](#交点端点)に従う。

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

### 3.3 IntersectionAnchor

<!-- test-contract: SPEC-ANCHOR-INTERSECTION-LOGICAL-POINT -->
IntersectionAnchorは、Symmetry展開後の2つのconcrete Segment instanceが交差する論理的な点を表す。どちらのSegmentをsplitするかという方向性は持たず、同じ2つのSegment instanceの交点は参照順を逆にしても同じIntersectionAnchorとして扱う。

IntersectionAnchorの意味は交点座標そのものではない。座標やSegment parameterは、現在のSegment定義とSymmetryから必要時に解決する。

Geometry上で同じ座標に複数の異なるIntersectionAnchorが存在しても、それらを同一のAnchorへ自動統合しない。

## 4. Segment

Cell Patternは複数の `Segment` から構成される。

最低限、Segmentは安定したIDと始点・終点のAnchor参照を持つ。source Segmentの端点はVertex、Edge Division PointまたはIntersectionAnchorとする。

現在、Segment同士の交差やsplitによってsource Segment定義そのものを破壊的に変更しない。

<!-- test-contract: SPEC-PATTERN-SEGMENT-FAMILY-CANONICALIZATION -->
同じ2つのSegmentEndpointAnchorを結ぶsource Segmentは、始点・終点の格納順が逆でも同じSegment定義として扱い、Cell Patternへ重複保持しない。

さらに、現在のSymmetryをsource Segmentの論理端点へ作用させたときに同じSegment定義orbitを生成するsource Segment同士は、同じSegment Familyとして扱う。Cell Patternは1つのSegment Familyにつきsource Segmentを1件だけ保持する。すでに存在するFamilyと同じFamilyになるSegmentを追加しようとした場合は、新しいsourceを追加せず既存sourceを維持する。

Familyの同一性はSegmentEndpointAnchorの論理identityとSymmetry作用から判定する。異なるAnchor参照が偶然同じPointへ解決されることだけを理由に同じFamilyへ統合しない。

### Segmentの重なり制約

<!-- test-contract: SPEC-PATTERN-SEGMENT-OVERLAP -->
source＋Symmetryから得られる異なるcanonical concrete Segment instanceに、同一直線上の有限長の共通区間がある状態を許可しない。包含の両方向、部分重複、異なるAnchor identityでGeometryが完全一致する非退化線分、新規source自身の異なるinstance間の重なりを拒否する。端点の格納順、辺名、Anchor種別、分割数に依存せず、既存Geometryの数値許容誤差に従って分類する。

端点1点の接触、通常の点交差、同一直線上の離れた区間、重なりのない辺上Segmentは許可する。stabilizerで同じ論理instanceへ正規化されるraw transformは別instanceとして比較しない。logical canonicalizationとGeometry overlap拒否は別責務であり、Geometry一致によってAnchor、SegmentId、Familyを統合しない。

検証対象はDesign側の線分全体とし、split後のFragment集合やEffective Geometryを使わない。重なり箇所または既存source全体が材なしでも追加を拒否する。材の除外・復元、split追加・解除は本制約を変化させない。

<!-- test-contract: SPEC-PATTERN-OVERLAP-ATOMIC-OPERATIONS -->
`addSegment` は現行の同一Anchor／ID／Family検証に加え、現在のSymmetryで展開した新規instanceと既存instanceの全組合せ、および新規instance同士の異なるpairを検証する。重なりがあれば追加全体を拒否し、元のPatternと追加候補を変更しない。既存sourceの代表選び直しや既存状態の修復は行わない。

`changeSymmetry` は変更先でFamily正規化とmapping導出を行った後、正規化済みsource群を展開した異なるcanonical instanceの全pairを検証する。重なりが残れば変更全体を拒否し、元のSymmetry、Segment、SplitRelation、MaterialExclusionをすべて維持する。同一Familyへの収束は従来の正規化で解消し、重なりがなければ依存情報の移行・正規化を続ける。鏡映軸の変更も同じ規則に従う。

これらはPattern操作の入力制約であり、importや既存malformed Patternの一括修復は保証しない。重なりの自動結合・延長・切詰め・source削除は行わない。

### Segment端点変更

<!-- test-contract: SPEC-PATTERN-ENDPOINT-UPDATE -->
source Segmentの端点変更は安定したSegmentId、反対側端点、他sourceの安定IDと論理参照、Symmetryを維持する。参照喪失時の連鎖削除は交点端点の規則に従う。元のlogical Anchorへの変更はno-opとする。同一端点、他sourceとのFamily重複、Design側の有限長overlapをatomicに拒否し、入力と依存情報を変更しない。自己一致をcanonicalizeしてから候補instance同士と他source全instanceを比較し、編集前の自分自身は比較対象にしない。端点接触・点交差・重複しない辺上Segmentを許可する。不正なsource・端点selector・許可されないAnchorの境界入力は安全に拒否する。

## 5. Cell Pattern

Cell Patternは、ユーザーが定義した基本Segment、それに適用するSymmetry、基本Segment間のSplitRelation、および材の不存在を表すMaterialExclusionから構成する。

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
1本の基本Segmentに対してSymmetryの各transformを適用し、**論理Segment定義として異なるconcrete instanceだけ**を生成する。元のSegmentはユーザー入力として扱い、対称操作によるコピーは派生データとする。

`none` は1 instanceとなる。`mirror` は通常2 instanceだが、鏡映後の論理端点pairが元と同じSegment定義になる場合は1 instanceだけとする。端点が入れ替わるだけの鏡映も同一定義に含む。現在の非退化source Segmentでは `rotational` の0° / 120° / 240°は3つの異なるinstanceになるが、展開処理はSymmetry種別ごとの本数を固定せず、同じ論理Segment定義へ解決されるtransformを一般に重複生成しない。

### 5.2 交点でのsplit

<!-- test-contract: SPEC-PATTERN-SEGMENT-SPLIT -->
splitはsource Segmentを破壊的に複数Segmentへ置換しない。Symmetry展開後の具体的なSegment instance pairによる交差関係は区別して扱うが、Cell Patternへ保持する `SplitRelation` はその1 pairそのものではなく、target source Segment、cutter source Segment、およびtarget instanceからcutter instanceへの相対transformで表した**対称軌道**とする。

現在のSymmetryに対する相対transformは、`none` では `identity`、`mirror` では `identity / mirror`、`rotational` では `identity / rotation +1 / rotation +2` を扱う。relation orbitを展開するときは、各raw target / cutter transformをsourceごとのcanonical concrete Segment instanceへ正規化する。sourceの自己対称性によって複数relativeTransformが同じdirected concrete pair orbitを表す場合は、それらも同じSplitRelation semanticsとして1つのcanonical relationへ統合する。同じ対称軌道に属するどの具体pairから操作しても同じ `SplitRelation` へ正規化し、同じrelationを重複保持しない。relationは交点座標、Segment parameter、候補表示用情報、操作時に選ばれた代表instance pairを保持しない。

relationは有向であり、対称軌道内のtarget側instanceだけを分割する。双方を分割するには逆向きのrelationも必要とする。逆向きrelationはconcrete pair orbitのtarget / cutterを反転して再canonicalizeする。sourceの自己対称性によるcollapseがない通常例では、rotationalの `+1` と `+2` は互いに逆、mirrorは自身が逆、identityは自身が逆となる。

relationから導出されるcanonical concrete pair orbitの**すべての具体pair**がsplit可能な場合だけ、そのrelationをCell Patternへ保持できる。split可能とは、交差が `cross` または `touch` であり、その交点がtarget instanceの内部に位置することをいう。有限長の `overlap` はsplitしない。同一のcanonical Segment instance自身との比較もsplit対象外とする。同一source Segment間でもcanonicalization後に異なるinstance同士を参照するrelationは許可するが、raw relativeTransformがnon-identityでも自己対称性によって同一instance自身へ潰れるrelationは許可しない。対称軌道の一部だけをrelationとして保持することはしない。

<!-- test-contract: SPEC-PATTERN-INTERSECTION-ANCHOR-DERIVATION -->
有効なSplitRelationをSymmetry orbitへ展開した各concrete target/cutter pairからIntersectionAnchorを導出する。1つのSplitRelationから複数のIntersectionAnchorが得られ得る。逆向きSplitRelationが同じconcrete pairを参照する場合、IntersectionAnchor自体は同じものを共有し、どちらのSegment instance上のsplit境界として使われるかだけがrelationのtargetによって異なる。

IntersectionAnchorをSplitRelationとは独立した一覧として二重管理しない。split由来のAnchor集合には、現在有効なSplitRelation orbitのconcrete pairから少なくとも1件導出されるAnchorだけを含める。一般の交点端点の存在はsplitに依存しない。同じIntersectionAnchorを逆向きrelationなど複数のrelationが支えてよく、そのうち1件を解除しても別relationから導出される間はAnchor自体が残る。どのrelationからも導出されなくなればsplit由来の集合から除く。交点座標とSegment parameterはIntersectionAnchorをGeometryへ解決した結果であり、Anchorのidentityではない。

<!-- test-contract: SPEC-PATTERN-FRAGMENT-LOGICAL-BOUNDARIES -->
split後のFragmentは、1つのSegment instance上で現在隣接している2つの論理境界に挟まれた区間として導出する。論理境界にはSegment instanceの端点と、そのinstanceをtargetとするSplitRelationから導出されたIntersectionAnchorを用いる。

SplitRelationを解除すると、そのrelationが提供していたtarget側のsplit境界は消滅する。別relationが同じIntersectionAnchorを支えてAnchor自体が残る場合でも、それだけを理由に解除済みrelationのtarget側境界を残してはならない。Anchorの現在の存在と、特定Segment instance上でsplit境界として現在有効であることは別々に判定する。

境界のSegment上での順序は現在のGeometryから必要時に求める。Segment parameter、境界のsort順、Fragment配列の位置、`fragmentIndex` は永続的なidentityとして扱わない。

以前導出されたFragmentの2境界間へ新しい論理境界が追加され、現在の境界集合で両者が隣接しなくなった場合、その旧Logical Fragmentは現在のFragmentとして扱わずGeometryへ解決しない。Fragmentの同一性はSegment instanceと順序を持たない2つの境界identityで判断し、境界の格納順だけが逆になっても現在隣接している同じ境界pairなら同じFragmentとして扱う。

異なる論理境界が同じ座標へ解決されても、その境界identityを自動統合しない。その結果として論理上ゼロ長のFragmentが生じることは許容するが、長さ0の区間を実Geometryとして生成しない。

<!-- test-contract: SPEC-PATTERN-SPLIT-SYMMETRY-CHANGE -->
Cell Patternは現在の設計Geometry上で有効なSplitRelationだけを保持する。Symmetryを変更するときは、新しいSymmetry上でsource Segment Familyを先にcanonicalizeし、統合される旧sourceから代表sourceへの論理instance mappingを使って、引き継ぎ可能なSplitRelationを新しいsource identityへ移行する。

旧relationのrelativeTransform自体が新Symmetryで表現できることを引き継ぎの前提とする。`identity` relationは `none / mirror / rotational` の間で引き継ぎ候補となり、mirrorの `mirror` relationはmirror軸変更でも候補となる。mirrorとrotationalのnon-identity relativeTransformを別種類へ推測変換しない。

source統合によりtarget / cutterの代表が変わる場合は、旧target identity instanceとrelativeTransformから得た旧cutter instanceを新Symmetry上のinstance mappingでそれぞれ写し、写像後のconcrete pairからrelativeTransformを再導出する。移行後に同じcanonical concrete pair orbitを表すrelationは1件へ正規化する。

その後、新しいSymmetryとcanonical Segment Familyからrelation orbitを再展開してsplit可能性を再検証する。自己instanceを参照するrelation、新しいSymmetryで表現不能なrelation、またはorbit全体が有効なsplitを形成しないrelationは削除する。現在効いていないrelationや、統合前のsource Segmentを将来復活させるための履歴は保持しない。

<!-- test-contract: SPEC-PATTERN-LOGICAL-DEPENDENCY-CLEANUP -->
Segment削除やSymmetry変更などで論理identityが変化するとき、Pattern状態遷移が明示的なlogical mappingを定義できる参照は、そのmappingを通して新しいcanonical identityへ移行してよい。Segment Family統合による旧source → representative sourceのinstance mappingはこの明示的なmappingに含む。

mappingを定義できずSegment instanceが消滅する場合、そのinstanceを参照していたIntersectionAnchorも現在の論理状態から消滅する。SplitRelation解除によって失われるのは対応する有向split境界であり、端点参照は消滅しない。論理的な参照先が失われた下位データを保持し続けず、依存関係に従って整合的に除去する。

一度消滅した論理参照を、後からGeometry上で同じ位置・形状の要素が現れたことだけを理由に自動で別identityへ付け替えたり復活させたりしない。元の2つのSegment instanceが交差し続けていても、有向SplitRelationのない境界を材指定やFragmentの境界として扱わない。一般の交点端点はDesign線分のpairから解決する。


### 5.3 Material Exclusion

MaterialExclusionは、Design Geometryから導出されるLogicalFragmentについて「その区間には材が存在しない」ことを表すCell Patternのドメイン状態とする。source SegmentやSplitRelationを破壊的に変更して材を消すのではなく、Design Geometry上の区間に材なし状態を重ねる。表示上のhidden stateとは扱わない。split境界がないSegment全体も `start-end` の1 LogicalFragmentとして扱われるため、Segment全体が材なしとなるMaterialExclusionも許可する。

MaterialExclusionはconcreteなLogicalFragmentそのものや描画座標、Segment parameter、fragmentIndexを保存しない。選択されたconcrete Fragmentを、そのsource Segmentとsource-relativeな2つの境界へ正規化して保存する。概念上の境界参照は次のように扱う。

```ts
type MaterialBoundaryRef =
  | { kind: 'segment-endpoint'; endpoint: 'start' | 'end' }
  | {
      kind: 'split-boundary'
      cutter: SegmentInstanceRef
    }

interface MaterialExclusion {
  segmentId: SegmentId
  boundaryA: MaterialBoundaryRef
  boundaryB: MaterialBoundaryRef
}
```

`split-boundary` は、`segmentId` のsource identity instanceをtargetとするconcrete pairのcutterを参照する。対応するcanonical SplitRelationもこのpairから導出できなければならない。source stabilizerがある場合、1つのcanonical SplitRelation orbitに同じidentity targetと異なるcanonical cutter instanceのpairが複数含まれ得るため、SplitRelationだけで境界を同一視しない。座標やSegment parameterではなくcanonical `SegmentInstanceRef` によって各IntersectionAnchorを区別する。保存上の `boundaryA / boundaryB` の順序はSegment上の先後を意味せず、現在のDesign Geometryへ解決したときに順序を求める。

<!-- test-contract: SPEC-PATTERN-MATERIAL-EXCLUSION-SYMMETRY -->
MaterialExclusionはsource Segment単位の状態とし、そのsourceからSymmetry生成される全Segment instanceへ同じ論理区間として適用する。どのconcrete Segment instance上のFragmentから操作しても、同じ対称軌道に属するFragmentであれば同じMaterialExclusionへ正規化する。source stabilizerが1つのconcrete Segment instanceを自身へ写し、その上の異なるFragmentを交換する場合も、それらを同じFragment orbitとして一括で除外・復元する。個々の対称コピーや同じorbitのFragmentごとに材の有無を別設定しない。

Symmetry変更で複数sourceが1つのSegment Familyへ統合される場合、各旧sourceのMaterialExclusionをrepresentative sourceへlogical mappingで移行し、移行後の全exclusionをunionして通常の区間正規化を行う。sourceの向きがrepresentativeに対して反転するmappingでは `start / end` を入れ替える。split-boundaryのcutter transformは保存時のSymmetry文脈に属するため、旧algebraでsource identity targetに対するrelative memberへ戻し、新Symmetryで表現可能な場合だけ新algebraのabsolute transformへ変換する。そのtarget / cutter双方をinstance mappingへ通したconcrete pairを新source identity targetへ正規化し、移行後に対応するcanonical SplitRelationが残る境界だけを保持する。新Symmetryで表現不能なmemberを別transformやGeometry一致から推測しない。

<!-- test-contract: SPEC-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION -->
同じ材なし状態を複数の冗長な区間表現で保持しない。重複、包含、隣接するMaterialExclusionは、現在のDesign Geometry上で同じ材なし範囲を表す最大区間へ正規化する。

例えば `I1-I2` と `I2-end` を順に材なしにした場合、保存される材なし区間は `I1-end` に正規化してよい。ただしこの正規化はLogicalFragmentやSplitRelationを統合・削除するものではない。I2を成立させるSplitRelationが残る限り、Design Geometry上では `I1-I2` と `I2-end` は別のLogicalFragmentとして残る。

材ありへ戻す操作は、選択した現在のDesign FragmentをMaterialExclusion集合から差し引く。例えば `I1-end` が材なしのときに `I1-I2` を戻すと、残るMaterialExclusionは `I2-end` となる。最大区間の正規化と、Editorで選択できるDesign Fragmentの粒度は独立して扱う。

MaterialExclusionの区間順序・隣接・包含の判定は、source Segmentのidentity instanceを基準にDesign Geometryへ解決して行う。Symmetry展開配列の先頭要素や、操作時にクリックされたconcrete instanceを基準にはしない。

<!-- test-contract: SPEC-PATTERN-EFFECTIVE-GEOMETRY -->
Design Geometryはsource Segment、Symmetry、既存SplitRelationから導出され、MaterialExclusionの有無だけを理由にSplitRelation、IntersectionAnchor、LogicalFragmentを消滅させない。MaterialExclusionをDesign Geometryへ適用し、実際に材が存在する区間だけをEffective Geometryとする。

Pattern Previewや加工上の材GeometryはEffective Geometryを用いる。新しく追加可能な交点・split候補もEffective Geometry同士の交差から導出し、材なし区間だけで成立する交点は新規候補にしない。新規split候補では、交点がtarget側の材ありEffective Fragmentの内部にあることを必須とする。cutter側は従来どおり端点でのtouchを許可する。

一方、すでにCell Patternへ保持されているSplitRelationの有効性はDesign Geometryを基準に維持する。MaterialExclusionによって交点周辺の材がなくなったことを理由に既存SplitRelationを無効化しない。これにより、MaterialExclusion → SplitRelation消滅 → 境界消滅 → MaterialExclusion消滅という循環を作らない。

<!-- test-contract: SPEC-PATTERN-MATERIAL-DEPENDENCY-CLEANUP -->
MaterialExclusionの外側境界として参照しているSplitRelationが解除される、参照Segmentが削除される、または状態遷移後に境界をsource-relativeに解決できなくなった場合、そのMaterialExclusionは成立しないため依存関係に従って削除し、材を復元する。

Segment Family統合のように旧source / boundaryから新しいcanonical source / boundaryへのlogical mappingを定義できる場合は、Geometry一致による推測付け替えとは扱わず、そのmappingによってMaterialExclusionを移行する。mapping不能として削除されたMaterialExclusionは、後から同じ位置に交点やSplitRelationが再び成立しても自動復活させない。

MaterialExclusionの正規化によって中間境界への参照が不要になっただけでは、その境界を成立させているSplitRelationを削除しない。SplitRelationはユーザーが明示的に作成したDesign Geometryの状態であり、MaterialExclusionの保存表現を最小化するためのgarbage collection対象にはしない。

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
2. source Segmentの端点Anchorをクリックする
3. もう1つの端点Anchorをクリックする
4. 2点を結ぶSegmentを追加する
5. Canvas上のSegment instanceを選択する
6. 選択中Segment上のIntersection candidateまたはLogicalFragmentを選択する
7. 下部Inspectorで選択対象の状態を確認し、split追加・解除、材なし・材ありへの変更など、その対象に対して可能な操作を実行する
8. symmetryを変更する
9. mirrorの場合は対称軸を変更する

split / Material Exclusion編集の主操作面はCanvasとする。cutter Segment、relativeTransform、Fragment IDなどの内部表現を一覧から選ばせることを基本操作にしない。

<!-- test-contract: SPEC-EDITOR-DIRECT-OBJECT-SELECTION -->
通常のCanvas操作では、SegmentEndpointAnchorはSegment / Fragmentの選択状態にかかわらずsource Segment作成対象とする。専用端点ハンドルから始まる操作と端点編集contextでは、後述の端点編集規則を適用する。Anchorのhit testを最優先し、1点目のAnchorを選択したときは現在のオブジェクト選択を解除してSegment作成途中状態へ入る。2点目のAnchorを選択するとsource Segmentを作成し、作成途中状態を解除する。

Segment作成途中でない状態で、見えているSegmentをクリックまたはタップすると、そのconcrete `SegmentInstanceRef` を選択する。Segment選択中は、選択中Segment上のIntersection markerをLogicalFragmentより優先してhit testし、Intersection以外の区間をクリックまたはタップするとそのLogicalFragmentを選択する。別Segmentを操作した場合は、そのSegment instanceへ選択を切り替える。

選択対象の優先順位は「SegmentEndpointAnchor → Intersection marker → 選択中SegmentのFragment → その他Segment → Canvas背景」とし、空間的に区別できる通常操作のhit testに利用する。ただし、同一点、近接、完全重複など、実画面上で十分なtap areaを確保すると人間が安定して選び分けられない複数のlogical candidateを、この優先順位だけで1対象へ潰してはならない。pointer位置からscreen-spaceの同じtap範囲へ入る候補集合を導出してEditorの一時状態として保持し、曖昧な場合だけInspectorで対象を明示的に選択させる。

上位priorityのtap領域によって下位のSegmentまたはLogicalFragmentのGeometry全体が覆われ、Canvas上の別の位置から直接操作できない場合は、下位対象も曖昧候補としてInspectorへ提示する。別の位置に直接操作可能な領域が残る場合は上位対象を優先し、通常操作を不要に曖昧化しない。

有効なCell Patternでは、同じSegment Familyのsource重複や同一source内のSymmetry自己一致によって完全重複するSegment instanceを生成しない。したがって、それらをInspectorで選び分けることを通常UIの要件としない。一方、異なるIntersection candidate、AnchorとIntersection、または意味上異なる対象が同じ座標・tap範囲へ現れる曖昧性は引き続き候補集合として扱う。

Segment作成途中とオブジェクト選択は同時に保持しない。1点目のAnchorの直接操作または明示確定はオブジェクト選択を解除し、Segment / Fragment / Intersectionの直接操作または明示確定は作成途中のAnchorを解除する。曖昧な終点候補のpreview・切替では開始Anchorを保持し、Anchorを明示確定すると、開始点と同じなら作成を取り消し、異なるならその2点からSegmentを作成する。開始点未指定なら確定したAnchorから作成を開始する。

preview中の候補行はアウトラインと太字で識別し、候補ラベルへ「確認中」などの状態文言を追加しない。状態文言の追加によるボタン幅や折り返しの変化を避ける。

<!-- test-contract: SPEC-EDITOR-CANDIDATE-PREVIEW -->
Canvasの複数候補は自動確定せずInspectorへ表示する。候補行のタップはpreviewであり、候補集合とgesture contextを保持したままCanvasで対象を確認し、一覧から別候補へ直接切り替えられる。preview中の行を識別可能にし、独立した「選択」操作で現在のpreviewを確定する。previewがなければ確定できない。Segment / Fragment / Intersectionは通常のselectionへ、通常の候補操作のAnchorは既存のSegment作成操作へ進む。preview・切替だけではcommandを発行せずCellPatternを変更しない。削除・split・材操作のInspectorは確定後に提供する。一意なCanvas hitとfocus済みAnchorのkeyboard操作は直接操作を維持する。

オブジェクト選択から候補一覧を開いた後も、選択開始時のSegmentを基準とする交点・FragmentをCanvasから操作できる。preview中に同じ交点や区間を再タップして曖昧な候補を取得した場合は、その候補一覧へ切り替えて旧previewを解除する。候補のpreview・切替はこの操作基準を変えない。取消しや確定で候補操作を終了すると操作基準の保持も終了し、以前のselectionを復元しない。Pattern変更で基準のSegment instanceが消滅した場合は参照を解除し、同じGeometryの別対象へ付け替えない。

previewはAnchorの対象点、Segmentのconcrete instance、Fragmentの対象区間（材なしでもDesign Geometryのghostから表示）、Intersectionの交点とconcrete target / cutterを強調する。開始Anchorとpreview Anchorを区別し、色だけに依存せず線種・太さ・輪郭・形も用いる。具体的な色やstroke値は契約にしない。hoverを要求せず、touchだけで候補タップ・Canvas確認・別候補・確定／取消しを完結できる。

Inspectorの取消し、Canvas背景、Escapeは候補・preview・gesture contextをすべて解除してidleへ戻す。Patternの巻き戻しや過去のselection復元は行わずglobal Undo / Redoから分離する。preview中の新しいCanvas hitは既存のhit操作として扱い、複数候補なら新しい候補集合へ切り替えて旧previewを解除し、一意hitなら直接操作へ進む。継続中のSegment作成contextは既存規則どおり引き継ぐ。Settings等のCell Editor外のUI操作だけではEditor選択を解除しない。通常のSegment作成途中・候補previewはタブの非表示化だけでは解除せず、復帰後も続行できる。非表示化による未確定編集の取消しは端点編集contextに限定する。

Pattern変更後も現在選択中の論理対象が同じidentityで存在する場合は選択を維持してよい。Segment削除、SplitRelation解除、Symmetry変更などで選択対象の論理identityが消滅した場合は選択を解除し、Geometry上で同じ位置・形状に見える別identityへ自動で選択を付け替えない。

<!-- test-contract: SPEC-EDITOR-INTERSECTION-SELECTION -->
Segment instance選択中に提示する新規Intersection candidateはEffective Geometryから導出する。ユーザーがCanvas上のIntersection candidateを選択すると、そのcandidateを成立させるcutter Segment instanceを必ずhighlightする。候補が1件だけの場合もhighlightする。

同じ表示座標に複数の異なるIntersection candidateが存在する場合、それらを座標一致だけで統合せず、Inspectorへcutterを識別できる候補として提示する。IntersectionとSegmentEndpointAnchorが同一点の場合も、精密な中心・外周の狙い分けを要求せず、両方を候補として提示する。候補のpreview後、明示確定で通常のIntersection選択またはAnchorのSegment作成操作へ進む。candidateはconcrete target/cutter pairとIntersectionAnchorを追跡しつつ、split操作時にはPattern層でcanonical SplitRelationへ正規化する。

既存SplitRelationが作るIntersectionもCanvasから選択可能とし、Inspectorで分割済み状態と解除操作を提示できる。CanvasでIntersectionを選択しただけではPatternを変更せず、追加・解除はInspector上の明示的操作として実行する。

<!-- test-contract: SPEC-EDITOR-FRAGMENT-MATERIAL-SELECTION -->
LogicalFragmentをCanvasから選択できる。材ありFragmentと材なしFragmentのどちらも同じDesign Fragmentを選択対象とし、Inspectorには現在のmaterial状態を表示する。材ありFragmentでは「材なしにする」、材なしFragmentでは「材を戻す」操作を提示する。

MaterialExclusionにより実線が描画されないFragmentも、Cell EditorではDesign Geometryを編集用のghost表示またはhit areaとして常時残し、元のLogicalFragment単位で選択・復元できるようにする。Segment全体が `start-end` のMaterialExclusionで材なしになっている場合も、ghostからSegmentを再選択できなければならない。選択中Segmentのghostは選択状態を判別できるよう強調してよい。Pattern Previewでは材なしFragmentを描画しない。

<!-- test-contract: SPEC-EDITOR-SELECTION-INSPECTOR -->
Cell Editor下部はSplitCandidateやFragmentの操作一覧を主UIとせず、現在選択しているオブジェクトのInspectorとする。Segment選択時はそのSegmentの状態、Intersection選択時はtarget / cutterとsplit状態、Fragment選択時は境界とmaterial状態を表示する。

Patternを変更する操作は、選択対象に対して意味のあるものだけをInspectorへ提示する。少なくともSegmentではsource Segment削除、Intersectionではsplit追加または解除、Fragmentでは材なしまたは材ありへの変更を行える。Symmetry生成されたSegment instanceを選択して削除する場合も、そのinstanceだけではなく対応するsource Segmentと同source familyを削除する操作として扱う。

SplitRelation解除によって依存するMaterialExclusionが削除される場合、Inspectorでは解除前にその影響があることを明示し、ユーザー確認を経て実行する。依存MaterialExclusionがない通常のsplit解除では追加確認を必須にしない。依存MaterialExclusionは正規化済みの現在状態を基準に連動解除し、正規化前の操作履歴を復元しない。

Inspectorの表示用ラベルや候補順をCell Patternの永続identityへ持ち込まない。

スマートフォンでは端点Anchor、Intersection、Fragment、Segmentの各選択対象に十分なタップ領域を確保する。

<!-- test-contract: SPEC-EDITOR-OVERLAP-REJECTION-NOTICE -->
Segment追加の重複・overlap拒否時はCell Editorの近くに「線分が重複するため追加できません」、Symmetry変更拒否時は設定の近くに「線分が重なるため対称変換を変更できません」と短く通知する。追加の他の拒否では、端点指定不正・使用済みID・参照喪失・材なし・同位置端点・循環など実際の原因を通知する。拒否理由と始点の再利用可否はPattern層の追加評価から取得し、UIで再判定しない。確認ダイアログや選択オプションは追加しない。対称変換は種類と必要なパラメータを合わせた完全な変更先（なし／鏡映A／鏡映B／鏡映C／回転）を直接選択する。非mirror状態でも各鏡映軸へ直接変更でき、中間状態や追加の確定操作、有効な軸の自動探索を設けない。設定表示は実際のPatternに一致させ、同じSymmetry設定を再選択しただけでは拒否通知を出さない。

### 6.1 Segment端点編集

#### 6.1.1 操作の基本

<!-- test-contract: SPEC-EDITOR-ENDPOINT-HANDLES -->
1. Canvasまたは既存の曖昧候補選択からSegment instanceを明示的に選択する。
2. 選択したinstanceの両端に、通常のAnchorと形状を区別した端点ハンドルを表示する。
3. ハンドルを直接ドラッグし、移動先Anchorと変更後の形状を確認する。
4. 有効な移動先で離すと1回の端点変更として確定する。依存する編集情報が失われる等の影響がある場合だけ、確定前に確認する。

長押しは要求しない。未選択のSegment、候補preview中のSegment、Fragment・Intersection選択中には端点ハンドルを出さない。Fragmentの分割境界をsource端点としてドラッグする機能は追加しない。材なしSegmentもDesign GeometryのghostからSegmentとして選択し、端点を編集できる。

同じAnchorを共有する他source Segmentの端点は変更しない。同一sourceの対称展開全体は変更する。共有Anchor自体の座標変更や単一の生成instanceだけの変形とは扱わない。

#### 6.1.2 ハンドルと既存タップ操作

- 選択中Segmentのハンドル領域から始まる操作は端点編集の操作として扱い、背後のAnchorによる新規Segment作成へ落とさない。
- 一意なハンドルを押して、移動距離の閾値未満で離した場合はSegment選択を維持する。Patternを変更せず、新規Segment作成も開始しない。
- 閾値を越えた後に開始位置へ戻って離した場合も、通常タップに変換しない。
- ハンドル以外の場所では既存のCanvas選択・AnchorによるSegment作成を維持する。
- ハンドルと重なるAnchorから新しいSegmentを作る場合は、背景タップ・Escape・Inspectorの「選択解除」でSegment選択を解除してから操作する。
- ハンドルは十分なscreen-spaceの操作領域を持ち、表示サイズとhit領域を区別してよい。shape・輪郭・選択表示を用い、色だけで区別しない。

両端のhit領域が重なる短いSegmentでは、pointerdownから一意に端点を決められなければドラッグを開始しない。近さ・DOM順・sourceのstart優先で決めず、Inspectorの端点指定を案内する。選択状態は維持する。

ハンドルの優先によって、短いFragmentや近接Intersection等の操作領域全体が覆われる場合も、操作不能にしない。既存hit resolverの「直接操作可能な領域が残るか」の考え方を利用し、その場合に限りInspectorへ「端点付近の対象を選択」を提示する。そこから覆われた論理対象を既存の候補preview・明示確定へ渡す。通常操作の一覧化やFragmentごとの常設操作ボタンにはしない。Anchorからの新規作成については前述の選択解除を使う。

#### 6.1.3 ドラッグ以外の端点編集

<!-- test-contract: SPEC-EDITOR-ENDPOINT-DESTINATION -->
Segment Inspectorに「始点を変更」「終点を変更」を置く。選択instanceの描画方向に対応する端点を指し、選ぶとCanvasでその端点を強調し、「移動先の点を選択」状態へ進む。この入口はハンドルが近接する場合、マウス・キーボード操作、ドラッグが難しい場合に共通で使う。

- 移動先Anchorのタップ、またはfocusしたAnchorのEnter / Spaceで指定できる。
- 一意ならドラッグを離した場合と同じ検証・確定へ進む。
- 曖昧なら候補preview・明示確定へ進む。
- この状態でAnchorを指定しても新規Segmentを作らない。
- Anchor以外のオブジェクトhitは変更先として受け付けない。背景・Escape・「取消し」は端点編集を取り消す。
- ハンドル自体もfocus可能とし、Enter / Spaceで同じ移動先選択へ進めてよい。キーボード用に重なる通常Anchorを二重の操作対象として残さない。

取消しでは、編集前の選択instanceが現在も存在する限りSegment選択へ戻る。通常の候補選択におけるclearは引き続きidleへ戻る。両者は異なる操作contextであり、既存の候補取消し仕様を全体的に変更しない。

#### 6.1.4 移動先と曖昧性

移動先は現在のEditorのdivision設定から得るVertex / Edge Division Anchorと、Effective Geometryに材がある交点Anchorとする。自由座標は対象外。空間座標を永続化せず、Anchor参照を変更する。

pointer位置からscreen-spaceのsnap領域に入るAnchorを求める。通常のAnchor hitと同じ座標変換・操作領域の考え方を使う。移動先の解決ではSegment / Fragment / 分割操作用の有向Intersection candidateを候補に混ぜない。

| 候補 | ドラッグ中 | 離した後 |
| --- | --- | --- |
| 0件 | 未確定のrubber-bandと移動先未指定を示す | 変更を取り消し、Segment選択へ戻る |
| 1件・変更可能 | snap先と変更後Patternをpreview | 影響確認が不要なら確定 |
| 1件・変更不可 | 禁止表示と短い理由。無効Patternは派生計算へ渡さない | 元のPatternを維持し、理由を通知 |
| 複数件 | 候補点を示し、1件を勝手に確定しない | 端点編集contextを保ってInspectorで選択 |

複数件では近いもの・変更可能なものだけへ自動で絞らない。無効候補も理由を示せるようにする。同じ座標の異なるAnchor identityは勝手に統合しない。pointerを移動して一意になるなら、その候補をpreviewする。snap領域外で無制限に最寄りAnchorへ吸着させない。

離した後の候補行タップはpreviewだけとし、「選択」で移動先を決める。候補が1件へ減った場合にも未選択候補を自動確定しない。既存の候補UIを利用できるが、確定後のcommandは端点変更であり、新規作成のstartAnchor contextと混同しない。

元のAnchorを指定した場合はno-opとしてSegment選択へ戻り、エラーや影響確認を出さない。反対側端点と同じlogical Anchorへの変更は拒否する。

#### 6.1.5 previewと確定

<!-- test-contract: SPEC-EDITOR-ENDPOINT-TRANSACTION -->
previewの毎回の入力は編集開始時の同じPatternと変更先Anchorである。前回previewのPatternへ次の変更を積み重ねない。

有効候補ではsource family全体と依存情報を更新した最終候補を表示する。Cell Editorでは元の選択instanceを薄く残し、操作中の線分・移動先を強調する。Pattern Previewにも候補のEffective Geometryを一時表示し、「端点変更プレビュー」と示す。これらは表示用の候補であり、Appの確定Patternは変更しない。

無効候補や移動先なしでは確定Patternをそのまま表示し、Editorの補助線だけで指の位置・無効性を示す。自由座標の補助線をSegmentとしてPattern APIへ投入しない。

候補が切り替わるたびに依存削除を含む評価を最初から行うため、一時的に交点を失った候補を通過しても、元へ戻れば依存情報は維持される。pointerの各pixel移動ではなく、候補Anchorや基準Patternが変わった時点で必要なdomain評価を行う。

通常の有効な変更はpointerupまたは移動先明示選択で1回だけ確定する。pointerup時にも現在位置の候補を解決し、最後のpointermoveの古い候補をそのまま採用しない。

#### 6.1.6 影響確認

<!-- test-contract: SPEC-EDITOR-ENDPOINT-IMPACT -->
次のいずれかが発生する場合に限り、候補を表示したままInspectorに影響と「変更する」「取消し」を提示する。

- 端点参照喪失によって依存sourceが連鎖削除される。
- 既存SplitRelationを引き継げない、または既存の有向concrete split境界を引き継げない。
- 既存MaterialExclusionの境界を引き継げず、その指定が解除される。
- 自己対称性の変化に伴うstabilizer closureによって、写した材なし区間を超える区間も材なしになる。

通常の端点移動に伴う交点座標・区間長の変化、境界順序の入れ替わり、意味を保ったcanonicalization / unionだけでは確認を出さない。確認は「分割が一部解除されます」「材なし区間N件が解除されます」「対称性を保つため材なし区間が広がります」等の利用者向けの短い説明とする。内部transformやrelation keyを判断材料にしない。

分割の有向境界消失を無向IntersectionAnchorの存在だけで判定しない。逆向きのrelationが残っても、target側の分割は失われ得る。件数は単純な配列長の差から求めない。unionで2区間が1区間へ正規化されても、維持された指定を「1件解除」と報告しない。

「取消し」は確定Patternを変更しない。「変更する」は現在の基準が一致することを確認して、同じPattern層の操作を再評価・確定する。確認中のCanvas入力は背景も含めて無視し、通常のCanvas作成・選択を発火させない。取消しボタンまたはEscapeで編集を終了できる。

#### 6.1.7 中断と競合

- Escape、pointercancel、確定前の予期しないcapture喪失、window blur、非表示化、複数pointerによる中断は未確定編集を取り消す。
- 正常なpointerup後のcapture解放通知で確定を再実行したり、確定済み変更を巻き戻したりしない。
- 編集中・候補選択中・影響確認中に確定Patternまたはdivision設定が変わったら、その編集を失効させる。古い候補を新しいPatternへ自動適用しない。
- 外部の変更自体は巻き戻さない。選択維持は現在の論理identityで照合し、消滅していればidleへ戻す。
- pointer captureや選択抑止はハンドルから始まった操作に限定する。ハンドル以外からのページスクロールを奪わない。ハンドルはpointerdown前からtouch-actionを設定できる実DOM領域を持たせる。
- touch / mouse / penをPointer Eventsで扱い、primary buttonだけを受け付ける。二重のmouse/touch処理系を作らない。
- dragに属するpointerup / clickが通常のCanvas hitやAnchor作成として再処理されないよう、gesture単位で消費する。次の独立したタップまで無条件に無視する方式にしない。

開始閾値、snap半径、線幅等の具体値は調整可能な実装パラメータであり、長押し時間や画素数そのものをTest Contractにしない。


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

## 交点端点

<!-- test-contract: SPEC-ANCHOR-INTERSECTION-ENDPOINT -->
### 1 交点の意味と指定可能範囲

- 端点は既存 `IntersectionAnchor = unordered pair<SegmentInstanceRef>` を保持する。座標コピー、独立Anchor ID、独立registry、SplitRelation IDを導入しない。
- 異なるcanonical concrete instanceの有限線分同士に `cross` または `touch` があるとき、そのpairの交点は解決可能。両端点同士のtouchも許可する。同一instance pair、none、overlapは交点端点にできない。
- 同じsourceの異なる対称instanceの交点も、別sourceの端点から参照できる。参照するsource自身のinstanceを含むpairは循環規則により禁止する。
- 未splitの交点も選べる。端点利用でsplitを暗黙追加しない。端点を接続しても参照元のFragmentは増えない。材操作のための分割は従来どおり明示操作する。
- 同一点の異なるpair、Vertex / Edge Divisionと同座標のIntersectionは別identityであり、候補を座標で統合しない。

<!-- test-contract: SPEC-ANCHOR-INTERSECTION-ENDPOINT-MATERIAL -->
新規に端点として選択できる交点は、現在のEffective Geometryで双方に材が存在する点とする。Fragmentの端点も材あり集合に含める。split追加と違い、targetの材あり区間の「内部」である必要はない。有向targetやsplit orbitの追加可否は端点候補の条件にしない。

選択後の既存端点の有効性・追従はDesign側の線分全体で判定する。後から参照点の材を消しても接続は解除しない。材を戻せば未使用交点は再び選択可能だが、削除済みsourceを復活させない。これにより#31の新規操作のEffective基準を維持し、材と参照解決の循環を避ける。

Pattern APIも、新規追加・端点の新しい参照指定時に上記の選択条件を入力Pattern上で検証する。既存端点の継続・移行ではEffective条件を再適用しない。同じlogical端点への変更は材なしでもno-opとする。候補の表示済みフラグを信用せず現在の入力Patternで再判定する。

<!-- test-contract: SPEC-PATTERN-ENDPOINT-DEPENDENCY-LIFECYCLE -->
### 2 依存・追従・消滅

`S.start = intersection(A@g, B@h)` はsource SがAとBに依存することを意味する。参照方向は「利用するsource → 参照されるsource」。両端点分の参照を集めたsource graphはDAGでなければならない。AとBが同一sourceなら依存辺は1本でよい。

- 直接自己参照、複数sourceを通る間接循環を拒否する。Symmetry transformや材なしで依存を回避しない。
- 依存先を先に解決し、source配列順に依存せず有限にGeometryを導出する。
- 参照元の端点移動に伴い交点が移動した場合、同じpairへ追従する。移動が下位sourceへ連鎖することを許可する。
- 参照元source削除、交差消失、instance移行不能、pairが同一instanceへ収束した場合、その交点を端点に持つ既存sourceを丸ごと削除し、下位依存へ連鎖する。半分のSegmentや未解決端点は保持しない。
- split解除では端点依存を削除しない。既存のsplit-boundaryに依存する材指定の解除は従来どおり。
- 削除済みsource、relation、材指定のhidden履歴は持たず、Geometryの再出現による自動復活を行わない。

新規入力の不正と既存参照の喪失は区別する。新規指定が無効、循環する、または要求した編集source自身が候補結果に残れない場合は拒否する。要求sourceを消して「編集成功」にしない。

### 3 拒否と連鎖削除の区別

| 候補状態 | 結果 |
| --- | --- |
| 新規指定の参照なし・不正transform・選択不可・自己/間接循環 | 操作全体を拒否 |
| 編集後も同じpairの交点が存在し移動する | 依存sourceを追従 |
| 既存参照が消滅・移行不能 | 依存sourceを連鎖削除する候補を作り、UIで影響確認 |
| 解決可能な生存sourceが両端同点に退化 | 操作全体を拒否。退化sourceを自動削除して救済しない |
| 生存source / canonical instanceに有限長overlap | 操作全体を拒否。材の有無で例外化しない |
| 端点編集により生存sourceのFamily重複が発生（下位source同士を含む） | 操作全体を拒否。編集ではFamily統合しない |
| Symmetry変更によりFamilyが一致 | 既存方針どおりlogical mappingで統合。その後に全体検証 |

退化については、現在の「同一logical端点拒否」を維持し、異なるidentityの両端がGeometry上で同点となる入力・依存移動も拒否する。Geometryの既存 `pointsAreClose` を正規化Cell座標の数値解像度判定として再利用する。新たなepsilonやユーザー向け最小部材長は導入しない。これはidentity統合ではない。非退化を確認してから `intersectSegments` へ渡す。

拒否時には入力Pattern（source、relation、材指定、Symmetry）を全て維持する。候補で行った連鎖削除・Family統合も適用しない。

<!-- test-contract: SPEC-EDITOR-INTERSECTION-ENDPOINT-INTERACTION -->
### 4 操作と表示

通常のAnchor操作を拡張する。交点専用の編集モードやsplit必須手順は増やさない。

| 状態 | 交点での操作 |
| --- | --- |
| idle / 通常selection | 交点Anchorを選ぶと新規Segmentの始点指定へ進む |
| Segment作成途中 | 交点Anchorを終点にできる。曖昧候補でも始点contextを維持 |
| 端点ハンドルdrag / Inspector端点変更 | 交点Anchorを変更先候補に含める。既存の一意候補確定・曖昧候補previewを維持 |
| 選択targetのsplit操作 | 従来の有向Intersection candidateを維持する |

作成用の無向交点Anchorと、split操作用の有向Intersection candidateは異なる用途。両方がhitする場合は一方を優先して隠さず、Inspectorに「端点として使う交点」と「分割を操作する交点」を区別して提示し、既存preview・明示選択で決定する。作成途中・端点変更中は端点候補を使い、split操作に意図せず遷移させない。従来のVertex / Edge Division操作と、上位markerに覆われる短いSegment / Fragmentへの到達可能性を維持する。

交点Anchor候補は選択targetに限定せずPatternから導出する。同じpairを逆順で二重表示しない。previewでは交点と構成する2つのconcrete instanceを強調し、端点変更では依存sourceを含む候補Geometryも表示する。無効な移動先の確定はPattern層で拒否し理由を表示する。循環等を防ぐためUI独自のGeometry検証を作らない。

keyboardで交点Anchorと曖昧候補へ到達し、選択・確定・取消しできる。hoverや精密tapを必須にしない。既存ハンドルのpointer capture / touch-actionを維持する。

<!-- test-contract: SPEC-EDITOR-ENDPOINT-DEPENDENCY-CONFIRMATION -->
### 5 影響確認・取消し・古い候補

- 端点編集では既存の分割・境界・材指定喪失と材なし拡大に、連鎖削除されるsource件数を加える。
- source削除・Symmetry変更でも、端点依存によるsource喪失がある場合は、同じPattern評価から得たsource・分割・材の影響をInspectorに表示して確認する。追加依存喪失がない既存操作へ一律に確認を増やさない。
- Family統合で代表へ移行できたsourceは「参照消失による削除」に数えない。要求したsource削除と追加の連鎖削除を区別する。材unionによる配列件数減を喪失扱いしない。
- 確認中は元Patternを保持する。承認時に元Patternの一致を確かめ、同じ要求を再評価して一度だけ採用する。取消しは変更なし。
- 端点編集のpreview・hit候補は開始Patternを基準とし、候補Patternを次の評価基準にしない。preview中に消える依存sourceや交点を候補導出の基準へ逆流させない。
- 編集/影響確認中に外部Patternが変更されたら中断する。古い承認を新Patternへ適用しない。
- 通常の作成途中は始点Intersectionを現在Patternで再照合する。消滅したら作成contextを破棄。存続なら同じidentityの現在座標へ更新し、終点確定時に新規操作条件も再検証する。
- 曖昧候補の消滅は既存reconcile方針（previewだけ解除、残る候補維持、1件になっても自動確定しない）を維持する。別pairへ座標で付け替えない。通常のUI再照合では現在のcanonical pairとのidentity一致を確認し、stabilizer変化で消えたpairを再正規化して存続させない。永続端点の明示的な継続と端点編集成功時のselection mappingは維持する。


## 文様生成

設定の「文様を生成」から「おまかせ v1」（structured-lines / algorithmVersion 1）を利用できる。文字列から輪郭・放射・風車の3構成のいずれかを生成する。全構成が回転対称、sourceは1〜2本、展開後は3〜6本。生成時のsplit・材除外は空。生成空間は小さく異なる文字列で同じ文様が出る。連結性、加工可能性、境界の連続性、美しさ、伝統文様の再現は保証しない。細かな生成条件・版切替・保存・共有・Undoは提供しない。

<!-- test-contract: SPEC-GENERATOR-TEXT-INPUT -->
入力のCRLF・単独CRをLFへ変換しUnicode NFC正規化する。空・trimで空の入力、正規化後UTF-16 code unitで1,024超、孤立surrogateは生成APIでも拒否し、日本語で理由を示す。切詰めない。seed計算ではtrimせず、前後の空白・改行を保持する。UTF-8のFNV-1aによるseedを使う（詳細と固定ベクトルは[Generator Architecture](architecture/generator.md)）。

<!-- test-contract: SPEC-GENERATOR-REPRODUCIBILITY -->
同じ文字列正規化結果、Generator ID、algorithmVersionから同じ論理Patternと編集分割数を返す。成功結果のrecipeを再入力しても同じ結果になる。現在のEditor、Layout、時刻、非決定的乱数に依存しない。ハッシュ衝突や異なるseedの同一文様を許容する。出力を変える際はalgorithmVersionを変更し、未対応版を最新へ黙って読み替えない。

<!-- test-contract: SPEC-GENERATOR-CANDIDATE -->
入力欄は初期空・例「組子」。開く時や入力変更だけでは生成せず、「生成」で読み取り専用セル図と既存4×9敷き詰め図を「生成候補・未適用」として表示する。生成しても確定Patternを変えない。入力変更・失敗で旧候補を消去し適用不可にする。閉じる・Escapeは候補を破棄し、確定Pattern・divisions・生成元を維持する。modalで背景操作を遮断し、focusを内側に保ち、終了時は起点ボタンへ戻す。タッチ操作可能で小画面ではdialog内をスクロールできる。

<!-- test-contract: SPEC-GENERATOR-APPLY -->
開いた時点で旧interaction、pendingOperation、端点preview、通知を終了する。取消しでも復元しない。開始Pattern参照・divisionsと適用直前の状態が異なれば候補を失効し「文様が変更されたため、もう一度生成してください」と表示し、現状態から再生成できる。

「この文様に置き換える」は生成とは別の操作。適用前に全置換・Undoなしを明示し、追加の確認dialogは設けない。成功時はPattern・編集分割数・生成元をまとめて置換し、候補と旧interactionを破棄して閉じる。同じsource IDでも旧selectionや端点編集を復活させず遅延pointer入力を引き継がない。旧split・材除外・Symmetryを混入しない。通常設定で線分がある間の分割数変更は禁止のままで、生成では文様全体の置換として新しい分割数を採用する。Layoutの行列数・向き・sideは維持する。適用後は通常の追加・削除・端点変更・split・材操作を利用でき、編集時にGeneratorを再実行しない。

<!-- test-contract: SPEC-GENERATOR-PROVENANCE -->
生成元recipe（ID / algorithmVersion / seed）はCellPatternと別に保持する。初期手描き状態はnull。成功適用時のみ更新し、手動編集・候補生成・入力変更・取消し・失敗では変更しない。「生成元：おまかせ v1」「生成条件は適用直後の文様を再現します。手動編集は含みません。」と表示する。入力欄の現在値を生成元とみなさない。recipeなしの通常Patternも独立に編集・描画できる。
