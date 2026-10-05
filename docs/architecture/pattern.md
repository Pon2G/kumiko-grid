# Pattern Architecture

この文書は、`docs/architecture.md` を入口とするPattern domainの詳細な技術設計を定義する。
プロダクト・domain上の意味と許可される状態・操作は `docs/spec.md` を正本とし、この文書ではそれを守るidentity、representation、derivation、state transitionの制約を扱う。

変更時はまず [Architecture overview](../architecture.md) で全体のmodule boundaryと依存方向を確認し、Pattern domainに影響する場合にこの詳細正本を参照する。

## Anchor

AnchorはPointそのものではなく、Cell Pattern内の論理的な点を参照する概念とする。長期的には概念上、少なくとも次を同じAnchor参照体系で扱える構成とする。

```ts
type AnchorRef =
  | VertexAnchor
  | EdgeDivisionAnchor
  | IntersectionAnchor
```

現在のsource Segment作成で端点として利用できるのはVertexとEdge Division Pointであり、IntersectionAnchorをsource Segment端点として許可することは別のdomain constraintとして扱う。Anchor unionへIntersectionAnchorを含めることと、すべてのAnchor種別をすべての用途で許可することは分けて設計する。

Vertexは頂点名を、Edge Division Pointはedge、divisions、indexを論理情報として持ち、座標は保存せず解決する。

## Segment

<!-- test-contract: ARCH-PATTERN-SEGMENT-IDENTITY -->
source Segmentの論理identityは安定した `SegmentId` とする。始点・終点AnchorはSegmentの現在の定義であり、identityそのものにはしない。

概念的には次のように表す。

```ts
interface Segment {
  id: SegmentId
  start: SegmentEndpointRef
  end: SegmentEndpointRef
}
```

端点2つをSegment identityとしない理由は、端点編集だけでSegment自体のidentityが失われ、SplitRelation等の参照が不要に連鎖して変化するためである。また、将来IntersectionAnchorを端点として許可した場合、IntersectionAnchorがSegmentInstanceRefを参照するため、端点構造からSegment identityを再帰的に定義するとidentity自体へ循環参照を持ち込み得る。安定したIDと現在の定義を分離し、端点pairはSegment definition / family equivalenceの判定には利用しても論理identityそのものにはしない。

同一Anchorを始点・終点に持つ退化Segmentは基本入力として作成しない。

### Segment definitionとSegment Family canonicalization

<!-- test-contract: ARCH-PATTERN-SEGMENT-FAMILY-CANONICALIZATION -->
現在source Segment端点として許可する `SegmentEndpointAnchor` は、VertexまたはEdge Division Anchorの論理参照である。Segment definitionは始点・終点の順序を持たない2 Anchorのpairとして比較する。同じAnchor pairを逆順で持つSegmentは同一定義とする。

SymmetryによるFamily判定は、PointSegmentへ解決した浮動小数点座標の近似比較ではなく、Symmetry transformを論理Endpoint Anchorへ作用させた結果から行う。Vertexはtransformによる頂点置換として、Edge Division Anchorは変換後edgeとその向きに応じたindexへ写す。edge向きが反転する場合は `index` を `divisions - index` へ対応付け、`divisions` 自体は維持する。この論理Anchor作用もSymmetry固有知識として `symmetry` 境界へ集約し、Pattern状態遷移側へSymmetry種別分岐を複製しない。

1つのsource Segmentへ現在のSymmetryの全transformを作用させ、得られるunordered Segment definitionの重複を除いた集合をそのSegment Family orbitとする。同じorbitを持つ複数source SegmentをCellPatternへ保持しない。異なるAnchor identityがたまたま同じPointへ解決されるだけでは同一definition / familyとみなさない。将来新しいSegmentEndpointAnchor種別を許可する場合も、Geometry近似へfallbackせず、そのAnchor種別に対するlogical Symmetry actionを定義してからFamily canonicalizationへ参加させる。

複数の既存sourceが同じFamilyへ収束した場合のrepresentativeは、配列順・描画順・最初に検出したGeometryへ依存させない。既存sourceのidentity Segment definitionに決定的な全順序を与えて代表を選び、同一定義の場合だけ安定したSegmentIdをtie-breakに利用する。新規Segment追加時に既存Familyと一致した場合は、新規sourceへ代表を入れ替えず、既存Familyをそのまま維持する。

canonicalizationでは各旧sourceについて、representative source上のどのtransformへidentity instanceが対応するか、および端点方向がpreserve / reverseのどちらかを `SegmentInstanceBasisMapping` として導出する。複数transformが同じdefinitionへ作用するstabilizerがある場合は、後述するcanonical concrete transformを選ぶ。

source Segmentを追加するPattern APIは、同一unordered Anchor pairと現在のSymmetry上のFamily重複を同じinvariantとして検証し、重複する新規sourceを追加しない。Symmetry変更も返却前に同じFamily invariantを回復する。React / Appが `segments` 配列へ直接appendしてこの検証を迂回しない。

### IntersectionAnchor

IntersectionAnchorは、Symmetry展開後の2つのconcrete Segment instanceが作る論理的な交点を表す。identityは順序を持たない2つの `SegmentInstanceRef` のcanonical pairとし、交点座標、Segment parameter、描画用IDを含めない。

```ts
interface IntersectionAnchor {
  first: SegmentInstanceRef
  second: SegmentInstanceRef
}
```

`first / second` はcanonicalizationのための格納順であり、target / cutterの意味を持たない。

IntersectionAnchorを `SplitRelation + logical transform` で表現しない。SplitRelationは有向であり、`A → B` と逆向きの `B → A` は別relationだが、同じconcrete instance pairの物理交点は同一IntersectionAnchorである。SplitRelationをidentityへ含めると、同じ無向交点に複数identityが生じるか、別途「無向intersection orbit」をcanonicalizeする仕組みが必要になる。現在必要なconcrete IntersectionAnchorは2つのSegmentInstanceRefから直接表す方が単純であり、orbitレベルのIntersection identityが必要になった場合にのみ別概念として導入する。

#9でsplit境界として扱うIntersectionAnchorは、有効なSplitRelationをsymmetry orbitへ展開したconcrete target/cutter pairから導出する。IntersectionAnchor自体はSplitRelationの有向性を持たず、そのAnchorがどちらのSegment instanceを分割する境界になるかはSplitRelationのtargetから決まる。逆向きSplitRelationが共存する場合、同じIntersectionAnchorを双方のSegment instanceの境界として利用できる。

## CellPattern

ユーザーが定義した基本Segment群、Symmetry、有効なSplitRelation、および正規化済みMaterialExclusionを持つ。

<!-- test-contract: ARCH-PATTERN-DERIVED-SEGMENTS -->
対称展開されたSegmentは基本Segment配列へ複製せず、派生データとして扱う。ユーザー入力の基本Segmentと対称操作による派生Segmentは区別できるようにするが、描画用IDの具体的な生成規則は契約としない。

### Segment instance identity

Symmetry展開後の各Segment instanceは、source Segment IDと論理transformからなる安定した `SegmentInstanceRef` で識別する。描画用文字列IDを論理identityや永続参照として利用しない。

概念的には次のように表す。

```ts
interface SegmentInstanceRef {
  sourceSegmentId: string
  transform: SegmentInstanceTransform
}

type SegmentInstanceTransform =
  | { type: 'identity' }
  | { type: 'mirror'; axis: MirrorAxis }
  | { type: 'rotation'; steps: 1 | 2 }
```

rotationalの `steps: 1 / 2` はそれぞれ基準instanceから120度 / 240度回転した論理位置を表す。角度によるPoint変換はGeometry解決時に行い、instance identity自体はSymmetry内の離散位置として表現する。mirrorでは軸も具体instance identityの一部とする。

ただし、rawなSymmetry transformとconcrete Segment instanceは1対1とは限らない。同一sourceへ異なるtransformを作用させても、論理Endpoint Anchor pairとして同じSegment definitionになる場合、そのtransform群は同じconcrete instanceを表す。代表transformはSymmetry algebraの決定的なtransform順序 / canonical keyから1つ選び、`SegmentInstanceRef` にはそのcanonical transformだけを用いる。

例としてmirrorでsource Segmentが自己一致する場合、`identity` と `mirror` を2つのSegment instanceとして生成せず、canonicalな1 instanceだけを生成する。軸上にある場合だけでなく、鏡映によってstart / endが入れ替わる場合も同じunordered Segment definitionとして扱う。

このsource依存の重複除去はSymmetry transform algebra自体を縮小するものではない。algebraは常にSymmetryの全raw transformを保持し、Segment instance側でsourceのstabilizerによる同値類をcanonical concrete transformへ射影する。

### Symmetry transform algebra

<!-- test-contract: ARCH-PATTERN-SYMMETRY-TRANSFORM-ALGEBRA -->
Symmetry固有の離散transform規則はPattern層の1つの境界へ集約する。上位のPattern操作は `none / mirror / rotational` を列挙して分岐するのではなく、現在のSymmetryから得たtransform algebraの共通操作だけを利用する。

各Symmetryは、現在有効な `SegmentInstanceTransform` の有限集合と、その集合上の少なくとも次の操作を提供するものとして扱う。

- identity transform
- 有効transform集合の決定的な列挙
- transformのcanonical key
- transformの合成
- transformの逆元
- transformが現在のSymmetryで有効かの判定
- Point / PointSegmentへのtransform適用
- SegmentEndpointAnchorへのlogical transform適用
- absoluteなinstance transformと `SplitRelativeTransform` の相互変換

概念上、`compose(a, b)` は「`a` を適用した後に `b` を適用する」合成とし、Geometryへ解決した場合に次を満たす。

```text
apply(compose(a, b), geometry)
  = apply(b, apply(a, geometry))
```

有効transform集合はidentityを含み、合成とinverseについて閉じる。relative transformは別個のcase表から計算せず、target transformを `t`、cutter transformを `c` としたとき、`compose(inverse(t), c)` で得られる同じalgebra上の要素を永続表現の `SplitRelativeTransform` へ射影して得る。逆にSplitRelationをorbit展開するときは、relative表現をalgebra要素へ戻し、各target transformへ合成してcutter transformを得る。

したがって、現在表現可能なrelative transform集合もinstance transform集合から導出する。`instanceTransforms` と `supportedRelativeTransforms` がSymmetry種別ごとに独立した対応表を持ち、両者の整合性を呼び出し側が維持する構造にはしない。

`SegmentInstanceTransform` はabsoluteなconcrete instance identity、`SplitRelativeTransform` は同じSymmetry文脈内で使う永続的な相対表現という区別を維持する。mirror axisのようにSymmetry文脈から一意に補える情報をrelative表現へ重複保存しない。relative表現へ変換できないtransformは、そのSymmetryでは表現不能として扱う。

Symmetry種別を識別する処理が必要な場合、そのdispatchはtransform algebraを構築するPattern層の境界へ閉じ込める。Geometry層、`designGeometry`、`materialExclusion`、`patternOperations`、`splitCandidates` へ同じcase分岐を複製しない。UI上のラベルや設定項目の表示分岐はこのdomain制約とは別責務とする。

このalgebraは現在の離散Symmetryを一貫して扱うためのものであり、将来の未知のSymmetryを先回りした汎用数学frameworkにはしない。具体的なclass / object / helper名や内部テーブル表現はArchitecture contractとせず、上記の操作と法則、および分岐の責務境界を契約とする。

### Segment instance mapping

<!-- test-contract: ARCH-PATTERN-SEGMENT-INSTANCE-MAPPING -->
Pattern状態遷移でsource Segmentのlogical representativeを変更する必要が生じた場合に備え、instanceの写像はGeometry座標の近似やSymmetry種別ごとのoffset式ではなく、同一Symmetry文脈のtransform algebraで表現できる構成とする。

概念上のbasis mappingは、少なくとも「旧sourceのidentity instanceが、新sourceのどのinstanceに対応するか」と「Segment方向が維持されるか反転するか」を表す。

```ts
interface SegmentInstanceBasisMapping {
  fromSourceSegmentId: SegmentId
  toSourceSegmentId: SegmentId
  toTransform: SegmentInstanceTransform
  direction: 'preserve' | 'reverse'
}
```

型名や具体的な格納形式は固定しない。`toTransform` は同一Symmetry内で有効なtransformであり、旧sourceのidentity Segment definitionが `toSourceSegmentId + toTransform` の論理Segment definitionに対応することを意味する。`direction` は旧sourceのorderedなstart / endが、そのtransformed representativeのstart / endと同順か逆順かを表す。MaterialExclusionのstart / endのようにSegment方向へ意味がある参照を移行するときだけ利用し、SegmentInstanceRefそのものへ方向フラグを混ぜない。

raw instanceをsource stabilizerのcanonical concrete instanceへ射影するときも、canonical refとraw definitionからcanonical definitionへの端点方向をSegment Family / instance canonicalizationの同じ責務から取得する。basis mappingの `direction` は旧source definitionからtransformed representative definitionへの向きであり、raw → canonical mappingの方向とは写像元・写像先が異なる。両者は同じordered logical Anchor比較規則を利用するが、値を機械的に共有しない。

旧sourceの任意のinstance transform `g` は、`compose(toTransform, g)` によって新source側のraw instance transformへ写す。sourceのstabilizerによって複数raw transformが同じconcrete instanceを表す場合は、さらにrepresentative source上のcanonical concrete transformへ射影する。SplitRelationの移行ではtarget / cutterそれぞれのinstanceをこの共通写像で移した後、写像後の2 concrete instanceからrelative transformを再計算する。rotationalのstep加減算やmirrorのXORをmigration側へ直接実装しない。

instance mappingは**同一Symmetry文脈内のlogical mapping**とする。Symmetry変更では、まずnext Symmetryを採用した文脈でsource Family canonicalizationとmappingを構築し、そのmappingへ引き継ぎ可能な旧relation / boundaryを入力する。旧relativeTransformがnext Symmetryでそもそも表現不能な場合はmappingによる別種類への推測変換を行わない。

Geometry上で近いinstanceを探してmappingを推測しない。また、mappingが定義できない参照を同じ位置に見える別identityへ自動付け替えしない。

### SplitRelationとrelative transform

<!-- test-contract: ARCH-PATTERN-SPLIT-RELATIVE-TRANSFORM -->
`SplitRelation` は具体的なinstance pairそのものではなく、target source Segment、cutter source Segment、およびtarget instanceからcutter instanceへの相対transformで表した対称軌道を保持する。

概念的には次のように表す。

```ts
interface SplitRelation {
  targetSegmentId: string
  cutterSegmentId: string
  relativeTransform: SplitRelativeTransform
}

type SplitRelativeTransform =
  | { type: 'identity' }
  | { type: 'mirror' }
  | { type: 'rotation'; steps: 1 | 2 }
```

`SegmentInstanceTransform` は具体instanceの絶対identity、`SplitRelativeTransform` は同じSymmetry内でのinstance間の相対位置であり、別概念として扱う。mirror軸は具体instance identityには含めるが、`relativeTransform: mirror` 自体には含めない。

相対transformの正規化・inverse・orbit展開は前節のSymmetry transform algebraを利用する。SplitRelation側で `none / mirror / rotational` ごとの算術や対応表を持たない。target transformを `t`、cutter transformを `c` としたrelativeはalgebra上の `compose(inverse(t), c)` から導出し、orbit展開時は各target transformとrelativeに対応するalgebra要素を合成してcutter transformを得る。

現在の外部意味は従来どおり、`none` では `identity`、mirrorでは `identity / mirror`、rotationalでは `identity / rotation +1 / rotation +2` を表現する。この列挙は保存モデルの意味であり、計算ロジックを各利用箇所へ分散させる根拠にはしない。

raw relationをorbit展開するときは、各target / cutter raw transformをsourceごとのcanonical concrete SegmentInstanceRefへ射影し、同じdirected concrete pairを重複除去する。sourceのstabilizerによって異なるrelativeTransformが同じdirected concrete pair orbitを表す場合、それらは同じSplitRelation semanticsである。表現可能なrelativeTransformを決定的な順序で比較し、同じcanonical concrete pair orbitを表すもののうち1つだけをcanonical relativeTransformとして保存する。

この正規化により、同じorbit内のどのconcrete pairから操作しても同じSplitRelationになる。保存上のrelation identityはcanonicalize済みの `targetSegmentId / cutterSegmentId / relativeTransform` の組とし、操作時に選ばれた代表pairやraw transformを保存しない。同じcanonical concrete pair orbitを重複保持しない。

concreteな有向target / cutter pairからrelation identityを導出するときは、Design Geometryが両instanceをcanonical concrete `SegmentInstanceRef` へ射影し、そのpairのrelative transformからcanonical orbit代表を返す。参照先が存在しない場合や現在のSymmetryでrelative transformを表現できない場合は導出不能とする。この導出はidentityだけを担当し、交差、orbit全体のsplit可否、Effective Geometry上での追加可否、CellPatternへの登録有無は各既存責務で別に検証する。MaterialExclusionのsource identity targetへのrebaseや、状態遷移でのsource mappingはこの導出へ含めない。

relationは有向である。逆向きrelationはcanonical concrete pair orbitのtarget / cutterを反転したorbitとして扱う。raw relativeTransformはalgebra上のinverseから導出し、source stabilizerがある場合は反転後のpair orbitに対するcanonical relativeTransformへ再正規化する。stabilizerの影響がない現在の通常例ではrotationalの `+1` と `+2` は互いに逆、mirrorとidentityはそれぞれ自身が逆元となる。逆向きrelationは元relationとは別のrelationとして共存できる。

### SplitRelationとIntersectionAnchor

SplitRelationとIntersectionAnchorは独立した保存データではない。SplitRelationは「どの対称軌道で、どちら側のSegment instanceを切るか」という有向な操作・状態を表し、IntersectionAnchorはそのorbitをconcrete pairへ展開した結果から得られる無向の論理点を表す。

```text
SplitRelation
  ↓ symmetry orbit展開
(target SegmentInstanceRef, cutter SegmentInstanceRef)
  ├─ 無向canonical pair → IntersectionAnchor
  └─ target + IntersectionAnchor → SegmentSplitBoundary
```

`SegmentSplitBoundary` は、IntersectionAnchorをどのtarget Segment instance上の境界として利用するかを表す派生情報であり、CellPatternへ保存しない。SplitRelationは有向orbit、IntersectionAnchorは無向logical point、SegmentSplitBoundaryは特定target上でのAnchorの役割という3つの意味を分離する。

1つのSplitRelationはSymmetryに応じて複数のconcrete pairへ展開されるため、SplitRelationとIntersectionAnchorは1対1対応ではない。逆向きSplitRelationは別relationだが、同じconcrete pairに対応するIntersectionAnchorは共有する。両方向のrelationがある場合は1つのIntersectionAnchorから両target上のSegmentSplitBoundaryが得られ、片方向だけを解除するとAnchorが残っても解除方向の境界は消滅する。

IntersectionAnchorをCellPattern内の独立したAnchor registryとしてSplitRelationと二重保存しない。必要なIntersectionAnchor集合とSegmentSplitBoundary集合は、現在有効なrelation orbitを同じ派生段階で解釈して得る。IntersectionAnchorは少なくとも1つのrelationが同じconcrete pairを支える間だけ存在する。一方、特定Segment instance上の境界は、そのinstanceをtargetとするrelationが支える間だけ存在する。Anchorの存在だけから別方向の境界を推論しない。他の永続ドメイン情報が境界などとして特定のIntersectionAnchorを参照する場合は、その参照値を保持してよい。参照先Anchorが論理的に消滅したときは依存削除規則を適用する。

### SplitRelationの有効性とCellPattern invariant

<!-- test-contract: ARCH-PATTERN-SPLIT-ORBIT-VALIDITY -->
relationのraw symmetry orbitをsourceごとのcanonical SegmentInstanceRefへ射影し、重複するdirected pairを除いた**canonical concrete pair orbit**の全pairがsplit可能な場合だけ、そのrelationを有効とする。各pairについて次をすべて満たすことをsplit可能条件とする。

- targetとcutterが同一の `SegmentInstanceRef` 自身ではない。
- intersection kindが `cross` または `touch` である。
- 交点のtarget側parameterがtarget Segment内部にある。
- `overlap` ではない。

cutter側parameterが内部であることは要求しない。これはtarget側だけをFragment化する有向splitの意味を維持するためである。

1つのrelationはSymmetry orbit全体を表すため、orbitの一部だけがsplit可能な部分relationは保持しない。現在のmirror / rotationalは等長変換であり、同じorbit内でsplit可否が不一致になる場合は部分relationとして救済せず、Geometryまたはtoleranceの不整合として扱う。

同一source Segment間のrelationも、canonical concrete pair orbitが異なるinstance同士を参照し、その全pairがsplit可能なら許可する。`targetSegmentId === cutterSegmentId` かどうかやraw `relativeTransform` の種類だけで有効性を決めない。stabilizerによってnon-identity relativeTransformが同一concrete instance自身へ潰れるrelationは無効とする。

<!-- test-contract: ARCH-PATTERN-SPLIT-RELATION-INVARIANT -->
CellPatternへ保持されるSplitRelationは常に、参照するcanonical source Segmentが存在し、現在のSymmetryでrelativeTransformを表現でき、canonical concrete pair orbitの代表relativeTransformへ正規化され、同じpair orbitを重複保持せず、orbit全体がsplit可能という不変条件を満たす。無効なrelationや「現在は効かないが将来復活するかもしれないrelation」をCellPatternへ保持しない。

relation追加APIはこの不変条件を満たさないrelationを追加できないものとする。Segment削除時はそのSegmentをtargetまたはcutterとして参照するrelationを除去する。

### Symmetry変更と状態遷移

<!-- test-contract: ARCH-PATTERN-SPLIT-STATE-TRANSITION -->
Symmetry変更はPattern層のatomicな状態遷移として扱い、ReactやGeometry導出処理で `symmetry` だけを直接差し替えたり、描画時に重複source / relationを隠してCellPatternへ残したりしない。

Symmetry変更時は次の順で新しいCellPatternを決定する。

```text
current CellPattern + next Symmetry
  ↓
next Symmetry上でsource Segment Familyをcanonicalize
  ↓
old source identity → representative concrete instance のbasis mappingを導出
  ↓
next Symmetryで表現可能な旧SplitRelationをmappingで移行
  ↓
stabilizerを考慮してrelationをcanonicalize / dedupe
  ↓
canonical source群のDesign Geometry上でrelation orbit全体を再検証
  ↓
旧MaterialExclusionをsource / boundary mappingで移行
  ↓
surviving relationを参照するexclusionだけを区間正規化
  ↓
Segment Family / SplitRelation / MaterialExclusion invariantを満たすCellPattern
```

relation移行では、旧target sourceのidentity instanceをtarget、旧relativeTransformをnext Symmetryのalgebraでabsolute cutter transformへ戻したinstanceをcutterとして、両者をsource basis mappingへ通す。写像後のcanonical concrete pairからrelativeTransformを再導出する。`identity` は `none / mirror / rotational` のすべてで引き継ぎ候補となり、mirrorの `mirror` はmirror軸変更時も候補となる。mirrorとrotationalのnon-identity relativeTransformを相互に自動変換しない。

複数sourceのrelationをrepresentativeへ移した結果、同じcanonical concrete pair orbitへ収束したrelationは1件へ統合する。target / cutterが同じcanonical concrete instanceへ潰れるものや、新しいDesign Geometryでorbit全体がsplit不能なものは保持しない。

Family統合で削除されたsource Segmentは、後からSymmetryを戻しても自動復活させない。CellPatternにhidden source履歴を保持せず、Undo / Redo等の編集履歴はこのcanonical modelとは別責務とする。

将来、Segment端点変更など設計Geometryを変更するPattern操作を追加する場合も、その操作は返却前にSegment Family、SplitRelation、MaterialExclusionの各invariantを回復する責務を持つ。

状態遷移では、論理identityを維持できる写像が明示的に定義されている場合だけ依存参照を維持する。Segment Family canonicalizationが導出するsource / instance mappingは明示的なlogical mappingであり、SplitRelationやMaterialExclusionのsource-relative参照をcanonical identityへ移すために利用する。

mappingを定義できずSegment instanceが消滅する場合、そのinstanceを参照するIntersectionAnchorも消滅し、さらにそのAnchorを必要とする下位の論理情報を依存関係に従って削除する。削除された依存情報は、後からGeometry上で同じ位置・形状の要素が再び現れても自動復活させない。

Symmetry変更で旧relationを引き継げるか、source統合で新しいrelationへ移行できるか、旧concrete IntersectionAnchorそのものを維持できるかは別に判定する。新しいAnchorはcanonical SegmentInstanceRef pairから再導出し、Point一致や近似から旧Anchorを付け替えない。

### Split candidateとIntersection interaction candidate

<!-- test-contract: ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION -->
新しく追加可能なSplitRelation候補は保存データではなく、target source、cutter source、現在のSymmetryで表現可能なrelativeTransformからrelation候補を作り、それぞれをcanonical concrete pair orbitへ正規化して**Effective Geometry上で**全concrete pairがsplit可能な候補だけを返す派生情報とする。stabilizerによって複数relativeTransformが同じpair orbitへ収束する場合はcanonical relation 1件だけを候補にする。新規候補の各concrete pairでは、交点がtarget側の材ありEffective Fragment内部にあることを要求する。cutter側は既存SplitRelationのsplit可能条件と同様、端点での `touch` を許容する。

candidate生成はraw relativeTransform、concrete instance pairの列挙順、最初に発見された交点からrelation identityを決めない。MaterialExclusionで材が存在しない区間だけに成立する交点は新規SplitRelation候補にしない。一方、すでに保持されているSplitRelationの有効性検証はDesign Geometryを基準とし、Effective Geometryから消えたことを理由に既存relationを暗黙削除しない。

<!-- test-contract: ARCH-PATTERN-INTERSECTION-INTERACTION-CANDIDATE -->
Canvas直接操作用には、source-levelのcanonical relation候補とは別に、選択中のconcrete target Segment instanceから見たIntersection interaction candidateを導出する。概念的には次を追跡する。

```ts
interface IntersectionInteractionCandidate {
  target: SegmentInstanceRef
  cutter: SegmentInstanceRef
  anchor: IntersectionAnchor
  point: Point
  relation: SplitRelation
  active: boolean
}
```

新規候補では `relation` はEffective Geometry上で追加可能なcanonical SplitRelation、既存splitではDesign Geometry上で現在保持されているSplitRelationを表す。選択中target instanceとrelation orbitから、そのtargetに対応するcutter instanceとIntersectionAnchorを決定する。

同じPointへ解決される異なるinteraction candidateを統合しない。座標はhit testと表示にのみ利用し、候補の表示順、描画順、Pointを永続identityにしない。Canvasで一意に識別できないcandidateはEditorの一時候補集合としてInspectorへ渡す。選択結果を保存するときは必ず `relation` をPattern層の状態遷移へ渡し、concrete pairや表示Pointそのものを保存しない。

### Fragmentと論理境界の導出

<!-- test-contract: ARCH-PATTERN-SPLIT-DERIVATION -->
Pattern層は、有効なCellPatternからsplit境界、論理Fragment、Geometryをpureに導出する。Geometry導出はCellPattern、SplitRelation、IntersectionAnchorの論理identityを追加・削除・修復しない。

Fragmentは1つのSegment instance上で現在隣接している2つの論理境界に挟まれた区間として導出する。Fragment自身に永続的な `fragmentIndex` や境界順序を持たせず、少なくとも「どのSegment instance上か」と「どの2つの論理境界の間か」を追跡できる構成とする。

Fragment境界は、Segment instanceの端点またはそのinstanceをtargetとするSplitRelationから得られたIntersectionAnchorで表す。

```ts
type FragmentBoundaryRef =
  | SegmentEndpointRef
  | IntersectionAnchor

interface LogicalFragment {
  segmentInstanceRef: SegmentInstanceRef
  boundaryA: FragmentBoundaryRef
  boundaryB: FragmentBoundaryRef
}
```

`boundaryA / boundaryB` は永続的な先後を意味しない。現在のGeometryへ解決したときに各境界のSegment parameterを求め、その時点の順序で一時的にsortし、隣接する境界pairからLogical Fragmentを導出する。parameter、sort順、fragmentIndexは派生情報であり論理identityにしない。

```text
source model
  ↓
Symmetry expansion + SegmentInstanceRef
  ↓
canonical SplitRelation
  ↓
symmetry orbit / concrete instance pairs
  ↓
IntersectionAnchor + target側split境界
  ↓
境界をGeometryへresolveして一時的に順序付け
  ↓
隣接境界からLogical Fragment
  ↓
PointSegmentへresolve
  ↓
Resolved / renderable Design Geometry
```

異なるIntersectionAnchorが同一点へ解決されてもAnchor identityは統合しない。その結果、隣接する2境界が同一点となるゼロ長Logical Fragmentが生じてもよい。Geometry解釈時に長さ0のPointSegmentを実Geometryとして生成しないことは固定の解決規則とし、論理Anchorの削除・統合とは扱わない。

新しいIntersectionAnchorが既存2境界の間へ加わった場合、境界の現在順序からFragmentを再導出する。旧Fragmentの配列位置や `fragmentIndex` を維持しようとはしない。一方、元のAnchor identity自体はGeometry上の並び替えだけを理由に変更しない。


### MaterialExclusion

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-MODEL -->
MaterialExclusionはconcrete LogicalFragmentの保存データではなく、source Segment上の材なし区間をsource-relativeな境界pairで表す。Pattern層の概念モデルは次とする。

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

`split-boundary` は `segmentId` のsource identity instanceをtargetとするconcrete pairについて、canonical cutter `SegmentInstanceRef` を保持するsource-relativeな境界表現である。1つのcanonical SplitRelation orbitには、source stabilizerにより同じcanonical targetと異なるcutterを持つpairが複数含まれ得るため、relation identityだけではIntersectionAnchorを一意にできない。境界からtarget / cutter pairを復元して対応するcanonical SplitRelationの存在を検証する一方、異なるcutter instanceは別境界として維持する。Point、Segment parameter、Fragment indexはidentityとして保存しない。

Segment端点の `start / end` はsource Segment定義の向きに対する論理参照であり、表示上の左右や上下を意味しない。`boundaryA / boundaryB` もSegment上の先後を永続意味にせず、現在のDesign Geometryへ解決して一時的にparameter順を求める。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION -->
CellPattern内のMaterialExclusion集合は、同一source SegmentについてDesign Geometry上で重複・包含・隣接する材なし範囲を持たないcanonicalな区間集合に正規化する。

Fragmentを材なしにする操作では、選択されたconcrete LogicalFragmentをsource-relativeな境界pairへ変換し、現在のexclusion区間集合とのunionを取り、最大の連続区間へ再表現する。材を戻す操作では、選択された現在のDesign Fragmentの範囲をexclusion区間集合からsubtractし、必要なら1区間を2区間へ分割して再表現する。

union / subtractionの区間順序・隣接・包含判定は、source Segmentのidentity instance上へsource-relative境界を解決して行う。Symmetry展開配列の順序や、ユーザーが操作したconcrete instanceを基準にしない。選択Fragmentをidentity instanceへ正規化した後、source stabilizerが交換する全Fragmentの区間をorbitとして閉じてからunion / subtractionへ渡す。これにより、同じconcrete Segment上の異なるFragmentであっても同じSymmetry orbitなら材状態を分離しない。計算中はDesign Geometryから得たSegment parameterを一時的な順序・区間計算に利用してよいが、parameter、座標、Fragment配列indexをMaterialExclusionへ保存しない。

例えば `I1-I2` と `I2-end` の除外が `I1-end` へ統合されても、I2を成立させるSplitRelationとLogicalFragment境界はDesign Geometryに残る。MaterialExclusionのcanonicalizationはDesign topologyのcanonicalizationではない。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-INVARIANT -->
CellPatternへ保持するMaterialExclusionは、source Segmentが存在し、両境界が現在のDesign Geometryで解決可能で、両境界が異なる有効区間を形成し、同一Segment上の他exclusionと重複・包含・隣接しない不変条件を満たす。`start-end` によるSegment全体のexclusionも有効な区間として許可する。

`split-boundary` のidentity target / concrete cutter pairから導出されるcanonical SplitRelationが存在しない場合、その境界は解決不能とする。SplitRelation解除時の依存判定も各境界pairからcanonical relationを導出して行う。MaterialExclusionの中間に存在するが外側境界として参照されていないSplitRelationは、exclusion正規化を理由に削除しない。

MaterialExclusionを追加・復元するPattern API、およびSegment削除・SplitRelation解除・Symmetry変更などのPattern状態遷移は、返却前にSplitRelation invariantとMaterialExclusion invariantの双方を回復する。依存境界が失われたexclusionは削除し、後から同じGeometryが再成立しても自動復活させない。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-SYMMETRY -->
concrete LogicalFragmentからMaterialExclusionを作るときは、そのFragmentが属するtarget SegmentInstanceRefの逆変換をtarget / cutter双方へ作用させ、source identity targetとcanonical cutterのpairへ正規化する。同じSymmetry orbitに属するどのtarget instanceから操作しても同じsource-relative MaterialExclusionになるが、target stabilizer内で異なるcanonical cutterへ至る境界は区別する。その後、Fragmentのstabilizer orbit全体をcanonical区間集合へ反映する。

Symmetry変更やSegment Family統合では、各旧MaterialExclusionの `segmentId` をtarget sourceのbasis mappingでrepresentativeへ写す。endpoint boundaryはtarget mappingの `direction` がreverseなら `start / end` を交換する。split-boundaryに保存されたcutterのabsolute transformは旧Symmetry文脈に属するため、旧transform algebraの `toRelative` でsource identity targetに対するmember semanticsへ戻し、新algebraの `fromRelative` で新Symmetryのabsolute transformへ変換してからcutter source mappingへ渡す。例えばmirror軸変更では `mirror(oldAxis) → relative mirror → mirror(newAxis)` と移す。新Symmetryで表現不能なmemberは移行不能とし、別transformやGeometry一致から推測しない。

変換後の旧target identity instanceとconcrete cutter instanceを、それぞれtarget / cutter source mappingへ通し、写像後のpairを新しいsource identity targetへ正規化する。対応するcanonical SplitRelationはpairから再導出するため、relation canonicalization後もconcrete boundary identityを失わない。canonical SplitRelation orbit自体のmigrationと、そのorbit内の特定concrete boundary memberのmigrationは別々に成立を検証する。

複数旧sourceから同じrepresentativeへ移行したMaterialExclusionはすべて同じsource上の区間としてunionし、移行後のDesign Geometryで通常の最大区間正規化を行う。これは新SymmetryでFamily全体へ同じ材状態を適用するためであり、representativeだけの旧状態を優先して他sourceの材なし指定を捨てない。

移行後に対応するcanonical SplitRelationが存在しないsplit-boundary、source / boundary mappingを定義できないexclusion、または有効区間を形成しないexclusionは保持しない。旧concrete IntersectionAnchorを新しいAnchorへGeometry近似で付け替えるのではなく、移行したsource-relative境界から新しいconcrete Anchorを再導出する。

### Design GeometryとEffective Geometry

<!-- test-contract: ARCH-PATTERN-DESIGN-EFFECTIVE-GEOMETRY -->
Design Geometryはsource Segment、Symmetry、現在有効なSplitRelationから導出する。IntersectionAnchor、SegmentSplitBoundary、LogicalFragmentはDesign Geometryに属し、MaterialExclusionの適用結果だけを理由に追加・削除しない。

Effective GeometryはDesign GeometryへMaterialExclusionを適用した結果であり、実際に材が存在するPointSegment群を表す。概念的な導出順は次とする。

```text
source Segment + Symmetry
  ↓
Segment instance / Design Geometry
  ↓
SplitRelation orbit
  ↓
IntersectionAnchor / SegmentSplitBoundary
  ↓
LogicalFragment
  ↓
MaterialExclusionをsource-relative境界から各instanceへ解決
  ↓
Effective Geometry
```

Pattern Preview、将来の加工出力、および新規split候補の交差判定にはEffective Geometryを利用する。一方、既存SplitRelationのinvariant、MaterialExclusion境界の解決、Editorで材を復元するためのLogicalFragment選択にはDesign Geometryを利用する。

この二層を分けることで、exclusionで材が消えたためsplit境界が消滅し、その結果exclusion自身が成立しなくなる循環を避ける。
