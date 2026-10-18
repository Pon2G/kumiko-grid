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

SegmentEndpointAnchorはVertex、Edge Division Point、IntersectionAnchorを含む。交点端点はsource定義とSymmetryの文脈から解決する。

Vertexは頂点名を、Edge Division Pointはedge、divisions、indexを論理情報として持ち、座標は保存せず解決する。

## Segment

<!-- test-contract: ARCH-PATTERN-SEGMENT-IDENTITY -->
source Segmentの論理identityは安定した `SegmentId` とする。始点・終点AnchorはSegmentの現在の定義であり、identityそのものにはしない。
`addSegment` は既存のSegmentIdと重複する追加を拒否し、入力を変更せず元のPatternを返す。

概念的には次のように表す。

```ts
interface Segment {
  id: SegmentId
  start: SegmentEndpointRef
  end: SegmentEndpointRef
}
```

端点2つをSegment identityとしない理由は、端点編集だけでSegment自体のidentityが失われ、SplitRelation等の参照が不要に連鎖して変化するためである。また、IntersectionAnchorを端点として利用すると、IntersectionAnchorがSegmentInstanceRefを参照するため、端点構造からSegment identityを再帰的に定義するとidentity自体へ循環参照を持ち込み得る。安定したIDと現在の定義を分離し、端点pairはSegment definition / family equivalenceの判定には利用しても論理identityそのものにはしない。

<!-- test-contract: ARCH-PATTERN-SEGMENT-DISTINCT-ENDPOINTS -->
同一Anchorを始点・終点に持つ退化Segmentは基本入力として作成しない。Pattern追加APIの `addSegment` でも、両端点のlogical Anchor identityが同一なら追加を拒否し、入力を変更せず元のPatternを返す。object参照が異なっていても、Vertexは頂点名、Edge Division Anchorはedge・divisions・indexが同じなら同一Anchorとする。identityの判定と別に、解決後の両端がpointsAreCloseで一致する退化も拒否する。identityの統合や新たな最小長は導入しない。

### Segment definitionとSegment Family canonicalization

<!-- test-contract: ARCH-PATTERN-SEGMENT-FAMILY-CANONICALIZATION -->
現在source Segment端点として許可する `SegmentEndpointAnchor` は、Vertex、Edge Division AnchorまたはIntersectionAnchorの論理参照である。Segment definitionは始点・終点の順序を持たない2 Anchorのpairとして比較する。同じAnchor pairを逆順で持つSegmentは同一定義とする。

SymmetryによるFamily判定は、PointSegmentへ解決した浮動小数点座標の近似比較ではなく、Symmetry transformを論理Endpoint Anchorへ作用させた結果から行う。Vertexはtransformによる頂点置換として、Edge Division Anchorは変換後edgeとその向きに応じたindexへ写す。edge向きが反転する場合は `index` を `divisions - index` へ対応付け、`divisions` 自体は維持する。この論理Anchor作用もSymmetry固有知識として `symmetry` 境界へ集約し、Pattern状態遷移側へSymmetry種別分岐を複製しない。

1つのsource Segmentへ現在のSymmetryの全transformを作用させ、得られるunordered Segment definitionの重複を除いた集合をそのSegment Family orbitとする。同じorbitを持つ複数source SegmentをCellPatternへ保持しない。異なるAnchor identityがたまたま同じPointへ解決されるだけでは同一definition / familyとみなさない。将来新しいSegmentEndpointAnchor種別を許可する場合も、Geometry近似へfallbackせず、そのAnchor種別に対するlogical Symmetry actionを定義してからFamily canonicalizationへ参加させる。

複数の既存sourceが同じFamilyへ収束した場合のrepresentativeは、配列順・描画順・最初に検出したGeometryへ依存させない。既存sourceのidentity Segment definitionに決定的な全順序を与えて代表を選び、同一定義の場合だけ安定したSegmentIdをtie-breakに利用する。新規Segment追加時に既存Familyと一致した場合は、新規sourceへ代表を入れ替えず、既存Familyをそのまま維持する。

canonicalizationでは各旧sourceについて、representative source上のどのtransformへidentity instanceが対応するか、および端点方向がpreserve / reverseのどちらかを `SegmentInstanceBasisMapping` として導出する。複数transformが同じdefinitionへ作用するstabilizerがある場合は、後述するcanonical concrete transformを選ぶ。

source Segmentを追加するPattern APIは、同一unordered Anchor pairと現在のSymmetry上のFamily重複を同じinvariantとして検証し、重複する新規sourceを追加しない。Symmetry変更も返却前に同じFamily invariantを回復する。React / Appが `segments` 配列へ直接appendしてこの検証を迂回しない。

### Geometry overlapの検証境界

logical Family / stabilizer canonicalizationとGeometry overlap拒否は別責務とする。Pattern操作は `expandPattern()` の論理定義に基づくcanonical instance展開を再利用し、解決済み線分のpairに対して `intersectSegments()` の `kind === 'overlap'` を入力制約へ利用する。独立した交差判定・epsilon・区間演算や、Geometryによるinstance重複除去は設けない。同じsourceでも異なるcanonical instanceは比較する。現在の `expandPattern()` はsource Segment群とSymmetryだけを展開入力の型として要求し、候補展開にもその情報だけを渡す。既存の依存情報を保持したままSegment群だけを候補へ差し替えた不整合なCellPatternは構築しない。依存closureを含む完全なsource定義を渡し、参照先を除いた部分sourceだけを展開しない。splitや材情報は不要である。

検証対象はsource＋SymmetryによるDesign側の線分全体であり、split FragmentやEffective Geometryは検証対象にしない。MaterialExclusionとSplitRelationの追加・解除・復元へ重複したoverlap検証を置かない。

`addSegment` は同一Anchor／ID／Family拒否を維持し、新規instanceと既存instanceの全組合せと新規instance内の異なるpairを検証する。既存instance同士を修復せず、代表も選び直さない。`changeSymmetry` は変更先でFamily canonicalizationとmapping導出を済ませてから全pairを検証する。どちらもoverlap拒否はatomicとし、入力を変更せず元の `CellPattern` をそのまま返す。途中のFamily統合結果や依存情報の移行結果を返さない。既存の `CellPattern → CellPattern` APIを維持し、UIは返却結果から拒否を判別する。

importや既存malformed Patternの一括修復は保証しない。交差分類へ渡す前に非退化を確認し、依存端点の移動でも全生存sourceの退化・Family重複・overlapを検証する。

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

IntersectionAnchorをCellPattern内の独立したAnchor registryとしてSplitRelationと二重保存しない。必要なIntersectionAnchor集合とSegmentSplitBoundary集合は、現在有効なrelation orbitを同じ派生段階で解釈して得る。split由来のAnchor集合へ含める条件は少なくとも1つのrelationが同じconcrete pairを支えることである。一般の交点端点の存在条件はDesign線分のcross/touchであり、この集合とは独立する。一方、特定Segment instance上の境界は、そのinstanceをtargetとするrelationが支える間だけ存在する。Anchorの存在だけから別方向の境界を推論しない。他の永続ドメイン情報が境界などとして特定のIntersectionAnchorを参照する場合は、その参照値を保持してよい。参照先Anchorが論理的に消滅したときは依存削除規則を適用する。

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
canonical source群をnext Symmetryで展開し全pairのoverlapを検証
  （重なりが残れば元のCellPatternを返して全変更を拒否）
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

Segment端点変更を含め、設計Geometryを変更するPattern操作は返却前にSegment Family、SplitRelation、MaterialExclusionの各invariantを回復する責務を持つ。

状態遷移では、論理identityを維持できる写像が明示的に定義されている場合だけ依存参照を維持する。Segment Family canonicalizationが導出するsource / instance mappingは明示的なlogical mappingであり、SplitRelationやMaterialExclusionのsource-relative参照をcanonical identityへ移すために利用する。

mappingを定義できずSegment instanceが消滅する場合、そのinstanceを参照するIntersectionAnchorも消滅し、さらにそのAnchorを必要とする下位の論理情報を依存関係に従って削除する。削除された依存情報は、後からGeometry上で同じ位置・形状の要素が再び現れても自動復活させない。

Symmetry変更で旧relationを引き継げるか、source統合で新しいrelationへ移行できるか、旧concrete IntersectionAnchorそのものを維持できるかは別に判定する。新しいAnchorはcanonical SegmentInstanceRef pairから再導出し、Point一致や近似から旧Anchorを付け替えない。

### Split candidateとIntersection interaction candidate

<!-- test-contract: ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION -->
新しく追加可能なSplitRelation候補は保存データではなく、target source、cutter source、現在のSymmetryで表現可能なrelativeTransformからrelation候補を作り、それぞれをcanonical concrete pair orbitへ正規化して**Effective Geometry上で**全concrete pairがsplit可能な候補だけを返す派生情報とする。stabilizerによって複数relativeTransformが同じpair orbitへ収束する場合はcanonical relation 1件だけを候補にする。新規候補の各concrete pairでは、交点がtarget側の材ありEffective Fragment内部にあることを要求する。cutter側は既存SplitRelationのsplit可能条件と同様、端点での `touch` を許容する。

candidate生成はraw relativeTransform、concrete instance pairの列挙順、最初に発見された交点からrelation identityを決めない。MaterialExclusionで材が存在しない区間だけに成立する交点は新規SplitRelation候補にしない。一方、すでに保持されているSplitRelationの有効性検証はDesign Geometryを基準とし、Effective Geometryから消えたことを理由に既存relationを暗黙削除しない。

候補の1回の導出では、Segment instance、ゼロ長を含むLogical Fragment、描画可能なDesign Geometryを一時的なsnapshotとしてまとめて導出する。snapshotとそこから作るEffective Geometry queryは生成元CellPatternに結び付いた派生値とし、利用側へ独立したCellPatternや別途生成したinstance lookupとの組み合わせを要求しない。利用側が生成元、Geometry、問い合わせ処理の一部を差し替えて正規のsnapshot / queryを再構成できる公開境界にはしない。公開する共有派生値は、配列だけでなく要素、座標、論理境界、orbit pairと交差結果まで再帰的に読み取り専用のviewとする。既存のmutableなGeometry返却APIへは共有参照を型アサーションで戻さず、必要な範囲を独立した値として複製する。

この読み取り専用境界は通常の型付きコードによる直接代入を防ぐものであり、runtimeでの完全な不変性、強制的な型アサーション、元Patternの別参照からの破壊的変更、snapshotの長期保持まで保証しない。factory利用、任意構築・spread再構成の拒否、共有値への代入拒否は、runtime behaviorのTest Contractではなく、`tsc`対象のcompile-time fixtureで継続検証する。MaterialExclusionの適用に必要なsource identity instance上の境界順序とEffective Geometryのinstance別lookupはquery内部で構築して共有する。canonical relationはorbit検証前に重複を除き、検証済みorbitのpairと交差結果はconcrete interaction candidateの組み立てにも再利用する。snapshot、query、lookupは1回の導出処理内だけで利用し、CellPatternやReact stateへ保存しない。

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

## Segment端点変更

### 更新の単位とAPI

<!-- test-contract: ARCH-PATTERN-ENDPOINT-CONTINUATION -->

操作の意味は「指定source SegmentIdのstartまたはendを、指定SegmentEndpointAnchorへ変更する」である。SegmentId、反対側端点、他sourceの安定IDと論理参照、Symmetryは維持する。参照喪失時には依存sourceを連鎖削除する。sourceのstart / endを並べ直したり、代表sourceを選び直したりしない。

Pattern層は、この変更をatomicに評価するpureな公開操作を持つ。返却結果は少なくとも `unchanged`、`rejected`（理由）、`changed`（新Patternと影響）を区別する。既存のaddSegment / changeSymmetryまで新しい結果型へ一括変更しない。

previewと確定はこの同じ操作を利用する。UIは返却された候補Patternを永続配列単位で組み替えず、確定時だけ完成したPattern全体を採用する。低水準のsetterや、任意の候補Patternを検証なしで適用する公開APIを増やさない。

拒否・no-opでは入力Patternと依存情報を変更しない。存在しないsource、無効なendpoint selector、現在許可していないAnchor種別等をtyped APIの通常入力として扱わない。境界で受け得る不正要求は安全に拒否する。汎用import validatorや既存malformed Patternの修復は対象外。

### 入力制約

次の順に候補定義を検証し、拒否時は依存情報の変更結果を返さない。

1. sourceの存在と変更対象端点を確認する。同じlogical Anchorへの要求はno-op。
2. start / endのlogical Anchor identityが同一になる変更を拒否する。
3. 依存先の移動に追従した全生存source間のFamily重複を拒否する。Family統合、他source削除、ID入れ替えによる救済は行わない。
4. 全生存sourceの退化およびcanonical instance全pairの有限長overlapを拒否する。
5. 制約を満たした場合だけ、次節の依存情報更新へ進む。

overlapには#68と同じexpandPattern / intersectSegmentsを利用し、Design側の線分全体を比較する。編集前の自分自身のinstanceを比較対象へ残さない。stabilizerによる論理的自己一致をcanonicalizeした後に比較する。材なし状態を理由に重なりを許可しない。

端点接触・通常の点交差・離れた同一直線上区間・重複しない辺上Segmentは許可する。退化判定には既存pointsAreCloseを使い、新たなepsilon・最小長・Anchor分数の約分は導入しない。異なるidentityの同座標端点も操作全体を拒否する。

### SplitRelationの継続規則

端点変更はsourceの定義変更であり、Family代表の交換とは異なる。旧定義と新定義のGeometry一致を要求するbasis mappingを、変形のmappingとして使わない。

既存の各SplitRelationについて、source IDと保存済みのrelativeTransformを継続の基準とする。同じSymmetry上で、target identity instanceとそのrelativeTransformに対応するcutter instanceを新定義へ解決し、新しいcanonical relationへ正規化する。そのorbit全体を新しいDesign Geometryで検証し、有効なら保持し、無効なら削除する。重複するcanonical relationは1件へ正規化する。

この規則は編集対象がtargetでもcutterでも同じである。他sourceをtargetとするrelationも必要に応じて変わる。Effective Geometry上の新規候補を再取得してrelationを作り直さない。材なしになった交点でもDesign Geometryとして有効な既存relationは維持する。新しく交差した相手とのsplitを自動追加しない。

自己対称性が変わる場合も、旧relationの保存済みrelativeTransformを1つの継続要求として扱う。旧stabilizerのため同値だった全raw relativeTransformを列挙して、複数の新relationへ増殖させない。逆に自己一致で同値になるrelationはcanonicalizeする。この継続規則は明示的に採用する仕様であり、移動前と後でconcreteな分割境界の集合が完全に一致するとは限らない。

例えばmirrorでtargetが自己一致し、identityとmirrorのrelativeが同一orbitだった場合、保存済みcanonical relativeがidentityなら、自己一致が解けた後もidentity orbitを継続する。以前target identity上にあったmirror cutterの境界は、継続後のそのtarget上に存在しなければ失われる。別relativeのsplitを補って保存しない。失われる境界と依存する材なし指定は影響確認の対象になる。

1つのorbitの一部だけを残す部分relationは作らない。移動によって分割が解除された後に元のAnchorへ戻しても、解除済みrelationを自動復活させない。未確定previewから元へ戻す場合は、編集開始Patternからの再評価なので失われない。

### MaterialExclusionの継続規則

1. source IDとsourceのstart / end roleを維持する。endpoint boundaryは同じroleへ追従し、元の絶対座標や長さ・割合へ固定しない。
2. split-boundaryは、旧source identity targetと保存されたcutter transformを同じsource ID・同じSymmetryの新定義へ写し、既存のconcrete boundary正規化を利用する。
3. 移行後の対応する有向relationと具体的境界が存在する場合だけ境界を保持する。relation keyの存在や無向Anchorの存在だけで通さない。
4. 両境界を保持でき、既存の区間規則で有効なMaterialExclusionを新Design Geometry上で正規化する。変更後のtarget stabilizerに対しても区間集合を閉じる。
5. 解決不能な境界に依存するexclusionは丸ごと解除する。近い交点への付け替え、残る側だけへの切詰め、パラメータ比による代替は行わない。

境界の前後関係が逆転しても、同じ論理境界pairの間として解釈する。座標が一致した異なる論理境界を統合しない。ゼロ長LogicalFragmentの扱いは既存規則を維持し、Geometryとしての長さゼロを理由に論理identityを新しく削除する処理を追加しない。両境界が同じlogical boundaryへ収束し有効区間でなくなった場合は解除する。

全体材なしのstart-end指定も端点移動に追従する。既存の区間unionとstabilizer closureを利用し、解除される旧指定の追跡と、union後の配列長を区別する。closureにより写した有効区間のunionを超えて材なしになる場合は、[端点編集の影響確認](../spec.md#616-影響確認)の対象とする。通常の変形で同じ区間の長さが変わるだけなら確認不要。

他sourceの材なし区間でも、編集Segmentをcutterとして境界参照していれば同じ移行・確認の対象になる。依存解除した指定のhidden履歴は保存せず、後から同じ交点が現れても復活させない。

### 影響の計算

影響はPattern層の候補構築と同時に導出し、UIで分割・材の意味を再実装しない。

- 各旧relationから継続先relationを追跡し、存在・orbit validityを確認する。canonical keyの変化だけを削除と数えない。
- 各旧有向concrete pairのsource ID・保存されていたcanonical transformを新定義でcanonicalizeし、継続先relationのorbitにその有向pairがあるか照合する。ない境界は失われる。これは喪失検出であり、旧pair群から新relationを追加するアルゴリズムには使わない。
- 新しいstabilizerにより複数pairが同一の有効境界へ写るだけなら、対応は保たれている。新定義で交点が移動したこと自体は喪失ではない。
- 各旧exclusionが有効な境界pairへ移行できたかを追跡する。正規化で吸収されても解除と数えない。
- 材なしの拡大は、新Design Geometry上で移行した有効区間のunionと、そのstabilizer closureとの差で判定する。旧座標の線分差分では判定しない。既存の区間演算責務を利用し、UIに別の区間演算を作らない。

候補は常に有効なCellPatternとして返す。segmentsだけを変更して旧依存配列を残した不整合なPatternを、UIや一般のGeometry導出APIへ公開しない。検証用には必要なsegments / symmetryの狭い入力を使い、relation再構成→boundary移行→材正規化の順で完成させる。

## 交点端点の依存と状態遷移

### 1 データと解決責務

`SegmentEndpointAnchor` にIntersectionAnchorを加える。CellPatternへAnchor registry・座標cache・依存graph・revisionを保存しない。依存graphと解決済みGeometryは1回の評価内の派生情報とする。

`sourceGeometry.resolveIntersectionAnchor` と `designGeometry.resolveSplitIntersectionAnchor` を分け、次の責務を明確にする。

1. pairが現在のsource Geometry上で一意な交点を作るかを解決する責務。split / 材に依存しない。
2. 有向SplitRelation由来の境界が現在存在するかを判定する責務。MaterialExclusionとFragmentは必ずこちらを確認する。
3. 新規端点候補としてEffective条件を満たすかを判定する責務。

`deriveSplitIntersectionAnchors` はsplit由来のAnchorだけを列挙する。全幾何交点の列挙をFragment境界生成へ渡してはならない。一般resolverを導入してもsplit解除による材境界喪失を無効化しない。

<!-- test-contract: ARCH-PATTERN-ENDPOINT-DEPENDENCY-DAG -->
### 2 循環しないモジュール境界

現在symmetryに同居するalgebra・logical canonicalization・Geometry展開を必要な範囲で分離する。

- transform algebra / 型 / primitive key: source Geometry、split、材を参照しない。
- logical Family / instance canonicalization: source定義と参照先sourceのcanonical情報を使う。参照先を先に処理する。Geometry近似を使わない。
- source Geometry解決・instance展開: DAGに沿って端点を解決し、algebraで対称展開する。splitとEffective Geometryに依存しない。
- Design Geometry: 解決済みinstanceにSplitRelationを適用して有向境界・Fragmentを導出する。
- Material / Effective Geometry: 従来どおりDesign Geometryに材状態を適用する。
- Pattern操作: 上記を編成し、完成した有効Patternと影響だけを公開する。

`symmetry → designGeometry → symmetry` のruntime import循環や、端点resolverから高水準 `expandPattern` を再帰呼出しする構造にしない。pairの単純key/生成とalgebraが相互importする問題も避ける。低水準primitiveを小さく切り出すだけでよく、汎用graph / constraint / transaction frameworkは作らない。

expandの入力は依存closureを含むsource定義とSymmetry。SplitRelation・MaterialExclusionを必要としない。編集sourceだけ、または参照先を除いたothersだけのPatternを解決しない。評価内ではsource ID別の解決結果を共有し、同じ依存木を毎回全再帰しない。永続cacheは不要。

<!-- test-contract: ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING -->
### 3 交点へのSymmetry作用・Family

交点 `I(A@g, B@h)` にtransform tを作用させるとき、両方のrefのtransformへ既存algebraのcomposeを作用させる。その後、各参照先sourceのstabilizerでcanonical instanceへ射影し、pairをunorderedに正規化する。作用の合成順は既存 `compose(a,b) = aの後にb` に従う。

primitiveなalgebraはraw refへ作用し、source文脈が必要なcanonicalizationはFamily責務側で行う。algebra自身にPattern全体の探索を持ち込まない。

Family keyはこの正規化済みlogical端点pairから導出する。Intersectionを座標へ解決してからstabilizerを決めない。依存先の自己一致により同じrefになるケースを正しく扱い、異なるpairが偶然同座標にあるだけなら別定義に保つ。その結果、Geometryだけが完全一致する異なるcanonical instanceはoverlapとして拒否される。

生成instanceから端点変更する場合は、表示先Anchorの両refへ選択instanceの逆transformを作用させる。sourceのstart/end role、raw→canonical方向、編集後selection mappingは#71の規則を維持する。

<!-- test-contract: ARCH-PATTERN-ENDPOINT-DEPENDENCY-ATOMICITY -->
### 4 端点変更時の継続

候補のendpoint差替え後、循環を先に拒否する。依存先から順に以下を実施する。

1. 参照先が継続するなら保存済みsource IDとtransformをその新定義でcanonicalizeしてpairを再構成する。旧stabilizerに含まれる別raw transformを列挙して参照を増殖させない。
2. 交点を解決できない既存利用sourceを除去し、その下位へ伝播する。新規要求・編集source自身の不正は拒否。
3. 生存sourceの退化・Family重複・全canonical instance間overlapを検証する。変更されたsourceだけに限定しない。
4. 生存source間の既存relationを#71の保存relative継続規則で再正規化・検証する。消滅sourceに依存するrelationは除去する。
5. 旧有向境界の対応と材指定を移行し、既存材normalization / stabilizer closureを実施する。
6. 旧source・relation・境界・材指定ごとの対応を追跡し、完成Patternと影響を返す。

依存sourceの端点が動いてもそのSegmentIdとstart/end roleを維持する。編集sourceの変形へGeometry一致を要求するbasis mappingを流用しない。

### 5 Symmetry変更とFamily統合

交点端点のtransformは旧Symmetry文脈に属する。両refをそれぞれ `oldAlgebra.toRelative → newAlgebra.fromRelative` に通し、member semanticsを継続する。mirror軸変更は旧mirrorから新mirrorへ移る。noneへの変更でmirror / rotation memberをidentityへ潰さない。表現不能なら端点参照喪失とする。

処理順を次のように確定する。

1. 元DAGの依存先から処理する。各sourceの両端点について、transform文脈変換と、処理済み参照先のsource basis mappingを適用し、canonical pairへ正規化する。
2. 参照不能・交点消失ならsourceを喪失扱いにし、下位へ伝播する。pairの両refが同一instanceへ写った場合も喪失。同じsourceでも異なるinstanceで交差するなら保持する。
3. 正規化済み端点定義を新SymmetryのFamilyとしてまとめ、現在と同じ決定的代表規則を使う。代表変更が起きた場合、既に作った下位参照を含むmappingを合成して更新する。
4. Family統合による参照書換えがさらに下位Familyを一致させることがある。source参照の正規化とFamily統合を、全参照が最終代表へ写るまで完了させる。変更の伝播は依存順、追加統合はsource数の厳密減少で有限に収束する。上限回数で途中結果を成功扱いにしない。
5. mapping後のDAGを再確認する。もし循環を作る場合は操作全体を拒否し、循環部分の削除で救済しない。生存sourceの退化と全体overlapも拒否する。
6. 元Patternから最終Patternへの合成mappingでSplitRelationとMaterialExclusionを一度移行する。中間統合ごとに材状態を削って結果を持ち越さない。

代表の選択は入力配列順に依存させない。段階的に最初に見たsourceを固定代表にして既存仕様を変更しない。basis mappingのtransformとdirectionを合成し、材endpoint roleの反転を維持する。最終材状態は移行可能な全旧sourceのunionであり、代表sourceの旧材状態だけを採用しない。

新しい代表へのlogical mappingがある場合はsource喪失ではない。mapping不能な交点端点のsourceとその下位だけを削除候補にし、同じ座標の別pairへ救済しない。

### 6 APIとUI接続

既存 `addSegment`、`removeSegment`、`changeSymmetry` の戻り値互換を必要なく破壊しない。新しい影響確認を必要とする削除・Symmetry変更にはpureな評価APIを用意し、既存APIも同じ評価処理へ委譲する。二重のcleanup実装を作らない。端点変更は既存result unionを拡張する。

評価は `unchanged / rejected(reason) / changed(pattern, impact)` を区別できること。impactは削除source ID集合等の根拠を持ち、UIが配列長差分から連鎖喪失を推測しない。UIから任意のnextPatternを適用するsetterは公開しない。承認は確認済みの操作要求に対して行う。

新規作成の拒否は既存addの評価を使って表示し、検証実装を複製しない。拒否された作成ではPatternを維持し、有効な始点contextを残して別終点を選べる。始点が消失・選択不可ならidleへ戻し理由を表示する。

交点端点の候補導出は、同じPatternのDesign Geometry snapshotとEffective Geometry queryから全canonical instance pairの解決点と選択可能identity lookupを作る。`EndpointGeometryQuery`を通常reconcile・hit test・marker・preview描画で共有し、候補ごとの全交点列挙や座標取得ごとのsource再展開を行わない。同座標でも異なるpairは保持する。Appは現在のPatternに対応する派生値をmemo化してEditorとeffectへ渡すが、永続cacheやReact stateには保存しない。UI用の正確なidentity照合と、ドメイン操作の明示的canonicalizationを分離する。
