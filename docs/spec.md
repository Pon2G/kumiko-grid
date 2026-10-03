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

source Segmentをユーザーが新規作成するときの端点として現在選択できるのはVertexとEdge Division Pointだけとする。IntersectionAnchorをsource Segmentの端点として利用する機能は現在の操作には含めない。

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

最低限、Segmentは安定したIDと始点・終点のAnchor参照を持つ。現在ユーザーが作成するsource Segmentの端点はVertexまたはEdge Division Pointとする。

現在、Segment同士の交差やsplitによってsource Segment定義そのものを破壊的に変更しない。

<!-- test-contract: SPEC-PATTERN-SEGMENT-FAMILY-CANONICALIZATION -->
同じ2つのSegmentEndpointAnchorを結ぶsource Segmentは、始点・終点の格納順が逆でも同じSegment定義として扱い、Cell Patternへ重複保持しない。

さらに、現在のSymmetryをsource Segmentの論理端点へ作用させたときに同じSegment定義orbitを生成するsource Segment同士は、同じSegment Familyとして扱う。Cell Patternは1つのSegment Familyにつきsource Segmentを1件だけ保持する。すでに存在するFamilyと同じFamilyになるSegmentを追加しようとした場合は、新しいsourceを追加せず既存sourceを維持する。

Familyの同一性はSegmentEndpointAnchorの論理identityとSymmetry作用から判定する。異なるAnchor参照が偶然同じPointへ解決されることだけを理由に同じFamilyへ統合しない。

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

現在のSymmetryに対する相対transformは、`none` では `identity`、`mirror` では `identity / mirror`、`rotational` では `identity / rotation +1 / rotation +2` を扱う。同じ対称軌道に属するどの具体pairから操作しても同じ `SplitRelation` へ正規化し、同じrelationを重複保持しない。relationは交点座標、Segment parameter、候補表示用情報、操作時に選ばれた代表instance pairを保持しない。

relationは有向であり、対称軌道内のtarget側instanceだけを分割する。双方を分割するには逆向きのrelationも必要とする。逆向きrelationでは相対transformも逆向きとなり、rotationalの `+1` と `+2` は互いに逆、mirrorは自身が逆、identityは自身が逆となる。

relationから導出される対称軌道の**すべての具体pair**がsplit可能な場合だけ、そのrelationをCell Patternへ保持できる。split可能とは、交差が `cross` または `touch` であり、その交点がtarget instanceの内部に位置することをいう。有限長の `overlap` はsplitしない。同一のSegment instance自身との比較もsplit対象外とする。同一source Segment間でもnon-identityの相対transformによって異なるinstance同士を参照するrelationは許可するが、同一sourceの `identity` relationは許可しない。対称軌道の一部だけをrelationとして保持することはしない。

<!-- test-contract: SPEC-PATTERN-INTERSECTION-ANCHOR-DERIVATION -->
有効なSplitRelationをSymmetry orbitへ展開した各concrete target/cutter pairからIntersectionAnchorを導出する。1つのSplitRelationから複数のIntersectionAnchorが得られ得る。逆向きSplitRelationが同じconcrete pairを参照する場合、IntersectionAnchor自体は同じものを共有し、どちらのSegment instance上のsplit境界として使われるかだけがrelationのtargetによって異なる。

IntersectionAnchorをSplitRelationとは独立した一覧として二重管理しない。IntersectionAnchorは、現在有効なSplitRelation orbitのconcrete pairから少なくとも1件導出される間だけ現在の論理状態に存在する。同じIntersectionAnchorを逆向きrelationなど複数のrelationが支えてよく、そのうち1件を解除しても別relationから導出される間はAnchor自体が残る。どのrelationからも導出されなくなれば消滅する。交点座標とSegment parameterはIntersectionAnchorをGeometryへ解決した結果であり、Anchorのidentityではない。

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

mappingを定義できずSegment instanceが消滅する場合、そのinstanceを参照していたIntersectionAnchorも現在の論理状態から消滅する。SplitRelation解除によって、あるIntersectionAnchorを導出するrelationがなくなった場合も同様に消滅する。論理的な参照先が失われた下位データを保持し続けず、依存関係に従って整合的に除去する。

一度消滅した論理参照を、後からGeometry上で同じ位置・形状の要素が現れたことだけを理由に自動で別identityへ付け替えたり復活させたりしない。元の2つのSegment instanceが交差し続けていても、現在有効なSplitRelationまたは明示的な状態遷移mappingから導出されなければ旧IntersectionAnchorを解決可能な論理Anchorとして扱わない。


### 5.3 Material Exclusion

<!-- test-contract: SPEC-PATTERN-MATERIAL-EXCLUSION -->
MaterialExclusionは、Design Geometryから導出されるLogicalFragmentについて「その区間には材が存在しない」ことを表すCell Patternのドメイン状態とする。source SegmentやSplitRelationを破壊的に変更して材を消すのではなく、Design Geometry上の区間に材なし状態を重ねる。表示上のhidden stateとは扱わない。split境界がないSegment全体も `start-end` の1 LogicalFragmentとして扱われるため、Segment全体が材なしとなるMaterialExclusionも許可する。

MaterialExclusionはconcreteなLogicalFragmentそのものや描画座標、Segment parameter、fragmentIndexを保存しない。選択されたconcrete Fragmentを、そのsource Segmentとsource-relativeな2つの境界へ正規化して保存する。概念上の境界参照は次のように扱う。

```ts
type MaterialBoundaryRef =
  | { kind: 'segment-endpoint'; endpoint: 'start' | 'end' }
  | {
      kind: 'split-boundary'
      cutterSegmentId: SegmentId
      relativeTransform: SplitRelativeTransform
    }

interface MaterialExclusion {
  segmentId: SegmentId
  boundaryA: MaterialBoundaryRef
  boundaryB: MaterialBoundaryRef
}
```

`split-boundary` は、`segmentId` をtarget source SegmentとするSplitRelation由来の境界をsource-relativeに参照する。保存上の `boundaryA / boundaryB` の順序はSegment上の先後を意味せず、現在のDesign Geometryへ解決したときに順序を求める。

<!-- test-contract: SPEC-PATTERN-MATERIAL-EXCLUSION-SYMMETRY -->
MaterialExclusionはsource Segment単位の状態とし、そのsourceからSymmetry生成される全Segment instanceへ同じ論理区間として適用する。どのconcrete Segment instance上のFragmentから操作しても、同じ対称軌道に属するFragmentであれば同じMaterialExclusionへ正規化する。個々の対称コピーごとに材の有無を別設定しない。

Symmetry変更で複数sourceが1つのSegment Familyへ統合される場合、各旧sourceのMaterialExclusionをrepresentative sourceへlogical mappingで移行し、移行後の全exclusionをunionして通常の区間正規化を行う。sourceの向きがrepresentativeに対して反転するmappingでは `start / end` を入れ替える。split-boundaryはtarget / cutterのinstance mapping後のpairからrelativeTransformを再導出し、移行後に対応するSplitRelationが残る境界だけを保持する。

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
Canvas上のSegmentEndpointAnchorは、Segment / Fragmentの選択状態にかかわらず常にsource Segment作成対象とする。Anchorのhit testを最優先し、1点目のAnchorを選択したときは現在のオブジェクト選択を解除してSegment作成途中状態へ入る。2点目のAnchorを選択するとsource Segmentを作成し、作成途中状態を解除する。

Segment作成途中でない状態で、見えているSegmentをクリックまたはタップすると、そのconcrete `SegmentInstanceRef` を選択する。Segment選択中は、選択中Segment上のIntersection markerをLogicalFragmentより優先してhit testし、Intersection以外の区間をクリックまたはタップするとそのLogicalFragmentを選択する。別Segmentを操作した場合は、そのSegment instanceへ選択を切り替える。

選択対象の優先順位は「SegmentEndpointAnchor → Intersection marker → 選択中SegmentのFragment → その他Segment → Canvas背景」とし、空間的に区別できる通常操作のhit testに利用する。ただし、同一点、近接、完全重複など、実画面上で十分なtap areaを確保すると人間が安定して選び分けられない複数のlogical candidateを、この優先順位だけで1対象へ潰してはならない。pointer位置からscreen-spaceの同じtap範囲へ入る候補集合を導出してEditorの一時状態として保持し、曖昧な場合だけInspectorで対象を明示的に選択させる。

上位priorityのtap領域によって下位のSegmentまたはLogicalFragmentのGeometry全体が覆われ、Canvas上の別の位置から直接操作できない場合は、下位対象も曖昧候補としてInspectorへ提示する。別の位置に直接操作可能な領域が残る場合は上位対象を優先し、通常操作を不要に曖昧化しない。

有効なCell Patternでは、同じSegment Familyのsource重複や同一source内のSymmetry自己一致によって完全重複するSegment instanceを生成しない。したがって、それらをInspectorで選び分けることを通常UIの要件としない。一方、異なるIntersection candidate、AnchorとIntersection、または意味上異なる対象が同じ座標・tap範囲へ現れる曖昧性は引き続き候補集合として扱う。

Segment作成途中とオブジェクト選択は同時に保持しない。1点目のAnchor選択はオブジェクト選択を解除し、Segment / Fragment / Intersection選択は作成途中のAnchorを解除する。2点目の候補が曖昧な場合は、候補選択中の一時状態が1点目のAnchorを保持し、InspectorでAnchorを選ぶとその2点からSegmentを作成する。Anchor以外を選ぶとSegment作成を取り消してその対象を選択する。Canvas内の対象物ではない場所をクリックまたはタップした場合、およびEscape操作では、候補が保持する操作contextを含むEditor interaction全体を解除する。Settings等のCell Editor外のUIを操作したことだけを理由にEditor選択を解除しない。選択解除時は候補選択とcutter highlightも解除する。

Pattern変更後も現在選択中の論理対象が同じidentityで存在する場合は選択を維持してよい。Segment削除、SplitRelation解除、Symmetry変更などで選択対象の論理identityが消滅した場合は選択を解除し、Geometry上で同じ位置・形状に見える別identityへ自動で選択を付け替えない。

<!-- test-contract: SPEC-EDITOR-INTERSECTION-SELECTION -->
Segment instance選択中に提示する新規Intersection candidateはEffective Geometryから導出する。ユーザーがCanvas上のIntersection candidateを選択すると、そのcandidateを成立させるcutter Segment instanceを必ずhighlightする。候補が1件だけの場合もhighlightする。

同じ表示座標に複数の異なるIntersection candidateが存在する場合、それらを座標一致だけで統合せず、Inspectorへcutterを識別できる候補として提示する。IntersectionとSegmentEndpointAnchorが同一点の場合も、精密な中心・外周の狙い分けを要求せず、両方を候補として提示する。候補選択後は通常のIntersection選択またはSegment作成途中へ遷移する。candidateはconcrete target/cutter pairとIntersectionAnchorを追跡しつつ、split操作時にはPattern層でcanonical SplitRelationへ正規化する。

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
