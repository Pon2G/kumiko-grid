# アーキテクチャ

この文書は、組子グリッドの長寿命な技術設計を定義する正本とする。個別機能の実装予定や進捗、既知の拡張候補そのものはGitHub Issueで管理する。

## 1. 設計原則

- Cell PatternとLayoutを独立させる。
- geometry、pattern、layoutのドメインロジックをReact UIから分離する。
- 幾何学計算は可能な限りpure functionとして実装する。
- 永続データには意味のある相対表現を保持し、描画座標は導出する。
- 論理identityとGeometry上の解決結果を分離する。座標、Segment parameter、配列順序、描画用IDなどの派生情報を論理identityにしない。
- 論理的に異なる要素がGeometry上で一致・重複しても、それだけを理由に論理identityを統合・削除・別identityへ付け替えない。
- 論理identityの参照先が消滅した場合、または状態遷移後への論理的な写像を定義できない場合は、そのidentityと依存する論理情報を整合的に削除する。Geometry上の類似・一致による自動復活は行わない。
- 派生Geometryとユーザーが入力した元データを区別する。
- 未実装機能を先回りして実装しない。
- 将来拡張のためだけに過剰な抽象化を導入しない。

## 2. 既知の拡張と設計判断

将来実装する可能性がある機能はGitHub Issueへ記録し、一覧をこの文書へ複製しない。

そのうち、現在のデータモデル・責務分離・永続化・Geometryなどの設計判断へ影響し得るものには `design-context` ラベルを付ける。

実装時は、変更対象に対応する `area:*` ラベルと `design-context` を使って関連Issueを確認する。Closed Issueも、現時点で実装しないという判断と設計背景を含む可能性があるため参照対象とする。

既知の拡張は次のように扱う。

- 今回の要件に不要な機能を先回りして実装しない。
- 既知の拡張を不必要に困難にする設計を避ける。
- 将来対応のためだけに現在のモデルを複雑化しない。
- 現在の要件との間にトレードオフがある場合は、その判断をPull Requestへ残す。

この文書には、将来機能のリストではなく、そこから確定した現在の設計原則だけを残す。

## 3. モジュール境界

現在の基本構成:

```text
src/
  geometry/
    intersections.ts       # PointSegment同士の交差・parameter・Geometry分割
    segment.ts             # PointSegment
  pattern/
    anchor.ts              # 論理Anchor unionとSegmentEndpointAnchorの解決
    segment.ts             # 安定したSegmentIdを持つsource Segment
    intersectionAnchor.ts  # concrete instance pairのcanonical identity
    splitting.ts           # SplitRelation、split境界、Anchor / Fragment Design Geometryの導出・解決
    materialExclusion.ts    # MaterialExclusionの正規化、Fragment操作、Effective Geometryの導出
  layout/
  components/
  app/
```

### geometry

正三角形、Point、PointSegment、交差判定、鏡映、回転、Segment parameterなど、UIに依存しない幾何計算を担当する。Geometry層は論理identityの所有者にならず、Pattern層から与えられた論理情報を座標・幾何構造へ解決するpureな計算を提供する。

### pattern

Cell Patternの論理モデルを担当する。Anchor参照、source Segment、Segment instance identity、SplitRelation、IntersectionAnchor、Fragment境界、MaterialExclusionなどの論理identityと依存関係はPattern側の責務とし、Symmetry等による派生Segment生成、Design Geometry、Effective Geometryへの解決を編成する。

Anchorやsource Segmentの型はPatternの論理モデルに置き、PatternからGeometryのpure functionを利用する。GeometryからPatternの論理型へ依存させない。全Anchorのunionである `AnchorRef`、source Segment端点に現在許可する `SegmentEndpointAnchor`、その専用resolverである `resolveSegmentEndpoint` を名前でも区別する。

### layout

Cell Patternをどこへどの向きで配置するかを担当する。Layout StrategyはCell Patternの内容を知らない。

### components

表示とユーザー操作を担当する。幾何学の数式や座標変換ルールはここへ直接実装しない。

### app

アプリケーション状態と各コンポーネントの接続を担当する。

新しい責務が必要になった場合も、既存の分離を崩して便宜的にUIへ実装するのではなく、その責務に適した境界を検討する。

## 4. 基本データモデル

### Point

計算結果として利用するCartesian座標。

```ts
interface Point {
  x: number
  y: number
}
```

Pointは描画・計算用であり、Patternが保持・導出する論理Anchorの永続表現そのものではない。

### Triangle

基準Cellの3頂点を持つ。

正規化した上向き正三角形を基準とする。

- A = (0.5, 0)
- B = (0, sqrt(3) / 2)
- C = (1, sqrt(3) / 2)

### 論理identityとGeometry解決

<!-- test-contract: ARCH-DOMAIN-LOGICAL-IDENTITY-GEOMETRY-SEPARATION -->
Patternの論理モデルは「何を参照しているか」を保持し、Geometryはその論理情報を現在の座標・幾何構造へ解決する。Point、PointSegment、Segment parameter、交点座標、Fragmentの配列順序などは解決結果であり、論理identityの正本にしない。

論理的に異なる要素が同じPointやPointSegmentへ解決されてもidentityは別のままとする。逆に、論理identityの参照先が削除された場合や、Symmetry変更などの状態遷移で新状態への論理的な写像を定義できない場合は、そのidentityが消滅したものとして依存データも削除する。Geometry上で同じ位置に別要素が存在することを根拠に、自動で参照を付け替えたり復活させたりしない。

### Anchor

AnchorはPointそのものではなく、Cell Pattern内の論理的な点を参照する概念とする。長期的には概念上、少なくとも次を同じAnchor参照体系で扱える構成とする。

```ts
type AnchorRef =
  | VertexAnchor
  | EdgeDivisionAnchor
  | IntersectionAnchor
```

現在のsource Segment作成で端点として利用できるのはVertexとEdge Division Pointであり、IntersectionAnchorをsource Segment端点として許可することは別のdomain constraintとして扱う。Anchor unionへIntersectionAnchorを含めることと、すべてのAnchor種別をすべての用途で許可することは分けて設計する。

Vertexは頂点名を、Edge Division Pointはedge、divisions、indexを論理情報として持ち、座標は保存せず解決する。

### Segment

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

端点2つをSegment identityとしない理由は、端点編集だけでSegment自体のidentityが失われ、SplitRelation等の参照が不要に連鎖して変化するためである。また、将来IntersectionAnchorを端点として許可した場合、IntersectionAnchorがSegmentInstanceRefを参照するため、端点構造からSegment identityを再帰的に定義するとidentity自体へ循環参照を持ち込み得る。安定したIDと現在の定義を分離し、端点pairは同一定義・同一Geometryの判定には利用しても論理identityにはしない。

同一Anchorを始点・終点に持つ退化Segmentは基本入力として作成しない。

#### IntersectionAnchor

<!-- test-contract: ARCH-PATTERN-INTERSECTION-ANCHOR-IDENTITY -->
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

#### IntersectionAnchorをSegment端点として利用する場合の依存制約

将来IntersectionAnchorをsource Segmentの端点として許可する場合、Segment Geometryの解決依存を有向グラフとして扱い、循環を許可しない。

例えばSegment Aの端点が `intersection(B, C)` を参照するなら、AはBとCのGeometry解決へ依存する。自己参照や `A → B → A` のような間接循環はGeometryを決定できないためdomain invariantとして拒否し、依存グラフをDAGに保つ。これはGeometry計算時に循環を推測して修復する責務ではなく、解決不能な論理モデルを作成しないためのPattern層の制約とする。

### CellPattern

ユーザーが定義した基本Segment群、Symmetry、有効なSplitRelation、および正規化済みMaterialExclusionを持つ。

<!-- test-contract: ARCH-PATTERN-DERIVED-SEGMENTS -->
対称展開されたSegmentは基本Segment配列へ複製せず、派生データとして扱う。ユーザー入力の基本Segmentと対称操作による派生Segmentは区別できるようにするが、描画用IDの具体的な生成規則は契約としない。

#### Segment instance identity

<!-- test-contract: ARCH-PATTERN-SEGMENT-INSTANCE-IDENTITY -->
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

論理identityとGeometryの一致は別概念とする。例えばmirror軸上のSegmentでは `identity` instanceと `mirror` instanceが同じPointSegmentへ解決され得るが、`SegmentInstanceRef` としては別instanceのままとする。Geometry上の一致を理由にinstance identityを統合しない。

#### SplitRelationとrelative transform

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

相対transformは概念的に、target transformを `t`、cutter transformを `c` としたとき `inverse(t) ∘ c` に相当する。現在対応するSymmetryでは、汎用Group abstractionを導入せず次の離散規則で決定的に正規化・展開する。

- `none`: `identity` のみ。
- `rotational`: transformを `0 = identity / 1 = rotate120 / 2 = rotate240` とし、`relativeSteps = (cutterSteps - targetSteps + 3) % 3` とする。orbit展開時は各 `g ∈ {0,1,2}` に対して `target = g`、`cutter = (g + relativeSteps) % 3` とする。
- `mirror`: `0 = identity / 1 = mirror` とし、relativeはtargetとcutterのXOR、orbit展開時のcutterはtargetとrelativeのXORとする。具体的なmirror instanceには現在のmirror軸を付与する。

この正規化により、同じorbit内のどのconcrete pairから操作しても同じSplitRelationになる。relation identityは `targetSegmentId / cutterSegmentId / relativeTransform` の組とし、操作時に選ばれた代表pairを保存しない。同じrelationは重複保持しない。

relationは有向である。逆向きrelationではrelativeTransformも逆元となり、rotationalの `+1` と `+2` は互いに逆、mirrorとidentityはそれぞれ自身が逆元となる。逆向きrelationは元relationとは別のrelationとして共存できる。

#### SplitRelationとIntersectionAnchor

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

#### SplitRelationの有効性とCellPattern invariant

<!-- test-contract: ARCH-PATTERN-SPLIT-ORBIT-VALIDITY -->
relationから展開される対称軌道の全concrete pairがsplit可能な場合だけ、そのrelationを有効とする。各pairについて次をすべて満たすことをsplit可能条件とする。

- targetとcutterが同一の `SegmentInstanceRef` 自身ではない。
- intersection kindが `cross` または `touch` である。
- 交点のtarget側parameterがtarget Segment内部にある。
- `overlap` ではない。

cutter側parameterが内部であることは要求しない。これはtarget側だけをFragment化する有向splitの意味を維持するためである。

1つのrelationはSymmetry orbit全体を表すため、orbitの一部だけがsplit可能な部分relationは保持しない。現在のmirror / rotationalは等長変換であり、同じorbit内でsplit可否が不一致になる場合は部分relationとして救済せず、Geometryまたはtoleranceの不整合として扱う。

同一source Segment間のrelationも許可するが、`targetSegmentId === cutterSegmentId` かつ `relativeTransform === identity` は同一instance自身を参照するため常に無効とする。mirrorまたはrotationalのnon-identity relationは、展開された全pairがsplit可能なら有効とする。

<!-- test-contract: ARCH-PATTERN-SPLIT-RELATION-INVARIANT -->
CellPatternへ保持されるSplitRelationは常に、参照するsource Segmentが存在し、現在のSymmetryでrelativeTransformを表現でき、canonicalに正規化され、重複せず、orbit全体がsplit可能という不変条件を満たす。無効なrelationや「現在は効かないが将来復活するかもしれないrelation」をCellPatternへ保持しない。

relation追加APIはこの不変条件を満たさないrelationを追加できないものとする。Segment削除時はそのSegmentをtargetまたはcutterとして参照するrelationを除去する。

#### Symmetry変更と状態遷移

<!-- test-contract: ARCH-PATTERN-SPLIT-STATE-TRANSITION -->
Symmetry変更はPattern層の状態遷移として扱い、ReactやGeometry導出処理で `symmetry` だけを直接差し替えたり、描画中にrelationを暗黙削除したりしない。

Symmetry変更時は次の順で新しいCellPatternを決定する。

```text
current CellPattern + next Symmetry
  ↓
新SymmetryでもrelativeTransformの意味を表現できるrelationを引き継ぎ候補にする
  ↓
新Symmetryから各relationのorbitを再展開する
  ↓
新しい設計Geometry上でorbit全体のsplit可能性を再検証する
  ↓
無効relationを除去する
  ↓
invariantを満たす新しいCellPattern
```

`identity` は `none / mirror / rotational` のすべてで引き継ぎ候補となる。mirrorの `mirror` はmirror軸変更時も引き継ぎ候補とし、新しい軸の具体instanceへ再展開する。mirrorとrotationalのnon-identity relativeTransformを相互に自動変換しない。引き継ぎ候補になったrelationも、新しいGeometryでorbit全体がsplit可能でなければ削除する。

将来、Segment端点変更など設計Geometryを変更するPattern操作を追加する場合も、その操作は返却前に同じSplitRelation invariantを回復する責務を持つ。Undo / Redo等の編集履歴はこのrelationモデルとは別責務とする。

<!-- test-contract: ARCH-PATTERN-LOGICAL-DEPENDENCY-CLEANUP -->
状態遷移では、論理identityを維持できる写像が明示的に定義されている場合だけ依存参照を維持する。写像を定義できずSegment instanceが消滅する場合、そのinstanceを参照するIntersectionAnchorも消滅し、さらにそのAnchorを必要とする下位の論理情報を依存関係に従って削除する。削除された依存情報は、後からGeometry上で同じ位置・形状の要素が再び現れても自動復活させない。

Symmetry変更でSplitRelationを引き継げることと、旧concrete SegmentInstanceRefや旧IntersectionAnchorを同一identityとして引き継げることは別である。relativeTransformの意味を維持してrelationを再展開した結果、concrete instance identityが変わる場合は、旧instanceに依存するAnchorやその下位データをGeometry上の近似で新instanceへ付け替えない。

#### Split candidateとIntersection interaction candidate

<!-- test-contract: ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION -->
新しく追加可能なSplitRelation候補は保存データではなく、target source、cutter source、現在のSymmetryで表現可能なrelativeTransformからcanonicalなrelation候補を列挙し、それぞれのorbitを展開して**Effective Geometry上で**全concrete pairがsplit可能な候補だけを返す派生情報とする。

candidate生成はconcrete instance pairの列挙順や最初に発見された交点からrelation identityを決めない。MaterialExclusionで材が存在しない区間だけに成立する交点は新規SplitRelation候補にしない。一方、すでに保持されているSplitRelationの有効性検証はDesign Geometryを基準とし、Effective Geometryから消えたことを理由に既存relationを暗黙削除しない。

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

同じPointへ解決される異なるinteraction candidateを統合しない。座標はhit testと表示にのみ利用し、候補の巡回順、描画順、Pointを永続identityにしない。Canvasでcandidateを選んだ結果を保存するときは必ず `relation` をPattern層の状態遷移へ渡し、concrete pairや表示Pointそのものを保存しない。

#### Fragmentと論理境界の導出

<!-- test-contract: ARCH-PATTERN-SPLIT-DERIVATION -->
Pattern層は、有効なCellPatternからsplit境界、論理Fragment、Geometryをpureに導出する。Geometry導出はCellPattern、SplitRelation、IntersectionAnchorの論理identityを追加・削除・修復しない。

<!-- test-contract: ARCH-PATTERN-FRAGMENT-BOUNDARY-DERIVATION -->
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


#### MaterialExclusion

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-MODEL -->
MaterialExclusionはconcrete LogicalFragmentの保存データではなく、source Segment上の材なし区間をsource-relativeな境界pairで表す。Pattern層の概念モデルは次とする。

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

`split-boundary` は `segmentId` をtarget source Segmentとするcanonical SplitRelationを参照するsource-relativeな境界表現である。具体的なSegmentInstanceRefやIntersectionAnchorを保存しない。Symmetry展開時にはtarget instanceごとに同じrelativeTransformを使ってcutter instanceを解決し、そのconcrete pairからIntersectionAnchorを導出する。

Segment端点の `start / end` はsource Segment定義の向きに対する論理参照であり、表示上の左右や上下を意味しない。`boundaryA / boundaryB` もSegment上の先後を永続意味にせず、現在のDesign Geometryへ解決して一時的にparameter順を求める。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-NORMALIZATION -->
CellPattern内のMaterialExclusion集合は、同一source SegmentについてDesign Geometry上で重複・包含・隣接する材なし範囲を持たないcanonicalな区間集合に正規化する。

Fragmentを材なしにする操作では、選択されたconcrete LogicalFragmentをsource-relativeな境界pairへ変換し、現在のexclusion区間集合とのunionを取り、最大の連続区間へ再表現する。材を戻す操作では、選択された現在のDesign Fragmentの範囲をexclusion区間集合からsubtractし、必要なら1区間を2区間へ分割して再表現する。

union / subtractionの計算中は、現在のDesign Geometryから解決したSegment parameterを一時的な順序・区間計算に利用してよい。ただしparameter、座標、Fragment配列indexをMaterialExclusionへ保存しない。

例えば `I1-I2` と `I2-end` の除外が `I1-end` へ統合されても、I2を成立させるSplitRelationとLogicalFragment境界はDesign Geometryに残る。MaterialExclusionのcanonicalizationはDesign topologyのcanonicalizationではない。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-INVARIANT -->
CellPatternへ保持するMaterialExclusionは、source Segmentが存在し、両境界が現在のDesign Geometryで解決可能で、両境界が異なる有効区間を形成し、同一Segment上の他exclusionと重複・包含・隣接しない不変条件を満たす。

`split-boundary` が参照するcanonical SplitRelationが存在しない場合、その境界は解決不能とする。MaterialExclusionの中間に存在するが外側境界として参照されていないSplitRelationは、exclusion正規化を理由に削除しない。

MaterialExclusionを追加・復元するPattern API、およびSegment削除・SplitRelation解除・Symmetry変更などのPattern状態遷移は、返却前にSplitRelation invariantとMaterialExclusion invariantの双方を回復する。依存境界が失われたexclusionは削除し、後から同じGeometryが再成立しても自動復活させない。

<!-- test-contract: ARCH-PATTERN-MATERIAL-EXCLUSION-SYMMETRY -->
concrete LogicalFragmentからMaterialExclusionを作るときは、そのFragmentが属するtarget SegmentInstanceRefをsource Segmentへ戻し、Intersection境界をそのtargetからcutterへのrelativeTransformへ正規化する。同じSymmetry orbitに属するどのtarget instanceから操作しても同じsource-relative MaterialExclusionになる。

Symmetry変更時は、MaterialBoundaryRefが参照するrelativeTransformを新Symmetryでも意味上維持でき、対応するSplitRelationが状態遷移後も有効な場合に限りMaterialExclusionを引き継ぐ。旧concrete IntersectionAnchorを新しいAnchorへGeometry近似で付け替えるのではなく、維持されたsource-relative境界から新しいconcrete Anchorを再導出する。

#### Design GeometryとEffective Geometry

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

### CellPlacement

基準CellのLocal CoordinateをPreview座標へ写す配置情報を表す。

少なくとも位置、回転、必要に応じてmirrorを表現できること。

## 5. 座標と変換

### Segment intersection

<!-- test-contract: ARCH-GEOMETRY-SEGMENT-INTERSECTION -->
Geometry層は、正規化Cell Local Coordinate上の2つの非退化Segmentについて、UIに依存しないpure functionで交差関係を判定する。結果は、交差しない `none`、双方の内部で1点交差する `cross`、少なくとも一方の端点で1点を共有する `touch`、同一直線上で有限長の共通区間を持つ `overlap` を区別する。同一直線上で共有するのが1点だけの場合は `touch` とする。`cross` と `touch` は交点と双方のSegment parameter（始点を0、終点を1）を返す。

浮動小数点の判定は完全一致に依存せず、共通epsilonを正規化Cell Local Coordinate上の距離許容誤差として用いる。外積やSegment parameterなど座標距離と異なるスケールの量を比較するときは、その量に対応する許容値へ変換する。epsilonはGeometry上の数値解像度であり、その範囲内の差異を独立した位置や境界として区別しない場合があるが、source Segmentの有効性を決める閾値にはしない。epsilonの具体値、変換式、交差判定アルゴリズムは契約としない。基本Segmentは非退化であるという現在の不変条件を前提とする。

<!-- test-contract: ARCH-GEOMETRY-SEGMENT-FRAGMENTATION -->
Geometry層は、PointSegmentと複数のparameter位置からFragmentを生成するpure functionを提供する。Segment内部の位置だけをSegment上の順序で用い、始点・終点およびepsilon内で同一点とみなせる重複位置ではGeometry Fragmentを増やさず、ゼロ長PointSegmentを生成しない。有効なsplit境界が存在しない場合は、source Segmentと同じGeometryを1つのFragmentとして保持する。入力Segmentは変更しない。このGeometry上の重複除去は、同一点へ解決された複数の論理境界identityを統合することを意味しない。

Edge Division Pointは辺の始点から終点への線形補間で求める。

<!-- test-contract: ARCH-GEOMETRY-MIRROR-MEDIAN -->
mirrorは選択した頂点と対辺中点を結ぶ中線に対して両端点を鏡映する。

<!-- test-contract: ARCH-GEOMETRY-ROTATION-CENTROID -->
rotationalは正三角形の重心を中心として120°、240°回転する。

<!-- test-contract: ARCH-LAYOUT-LOCAL-COORDINATE -->
下向きCellでもSegmentEndpointAnchor自体の意味は変えない。基準CellのLocal Coordinateを配置変換して向きを表現する。

基準三角形の外接矩形高さを `height` とした場合、下向きCellへの基本変換は概念的に次で表現できる。

```text
(x, y) -> (1 - x, height - y)
```

その後、必要な拡大・平行移動を適用する。

## 6. Layout Strategy

Layout StrategyはCell Patternから独立した配置生成規則とする。

現在の `triangular-grid` は、行・列に応じて上向き / 下向きのCellを配置する。

Layout固有の配置規則をCell Patternのモデルへ持ち込まない。

## 7. UIとの境界

Reactはdivision数、Segment作成途中のAnchor、Canvas上の現在選択、同一点候補の巡回位置など一時的な操作状態を所有してよい。一方、CellPatternのSymmetry、SplitRelation、MaterialExclusionを変更するときの正規化・依存削除・不変条件回復はPattern層のドメイン操作へ委譲する。Reactから永続配列を便宜的に直接差し替えて不変条件を迂回しない。

<!-- test-contract: ARCH-EDITOR-SELECTION-STATE -->
Cell Editorの選択状態は、永続モデルとは分離した一時状態として少なくとも次の意味を表せる構成とする。

```ts
type EditorSelection =
  | { kind: 'segment'; segment: SegmentInstanceRef }
  | { kind: 'intersection'; candidate: IntersectionInteractionCandidate }
  | { kind: 'fragment'; fragment: LogicalFragment }
  | null
```

具体的なReact stateの分割方法は契約としない。選択解除時はintersection candidateの巡回状態やcutter highlightなど、その選択に従属する一時状態も破棄する。

<!-- test-contract: ARCH-EDITOR-HIT-TEST-PRIORITY -->
Canvasのhit testでは、選択中target上のIntersection markerをFragmentより優先し、Fragmentをその他Segmentより優先する。材なしFragmentはEffective Geometryには存在しないため、選択中SegmentについてDesign Geometry由来の編集用hit areaを別に提供する。hit areaのSVG要素構造や具体サイズは契約にしない。

同一点に複数Intersection interaction candidateがある場合は、Pointを1つの論理候補へ統合せず、UI一時状態としてcandidateを巡回する。1候補の場合を含め、選択中candidateのcutter Segment instanceをCanvas上でhighlightする。

<!-- test-contract: ARCH-EDITOR-INSPECTOR-BOUNDARY -->
Cell Editor下部は候補一覧の所有者ではなく、現在のEditorSelectionを表示・操作するInspectorとする。Canvasは「どの論理対象を操作するか」を選ぶ主操作面、Inspectorは「選択対象が現在どの状態で、どの状態遷移を実行できるか」を明示する面として責務を分ける。

Intersectionのsplit追加・解除、Fragmentの材なし・材ありへの変更などCellPatternを変更する操作はInspectorからPattern層の状態遷移APIを呼ぶ。Canvas上の選択操作だけでCellPatternを暗黙変更しない。将来、操作手数を減らすショートカットを追加しても、同じPattern APIを利用し、この責務境界を迂回しない。

コンポーネントは計算済みモデルとcallbackを受け取り、次の処理をドメイン層へ委譲する。

- SegmentEndpointAnchorから座標への解決
- mirror / rotational変換
- SplitRelationの正規化、検証、Symmetry変更時の再検証
- MaterialExclusionの正規化、依存削除、Fragment単位のexclude / restore
- Design Geometry / Effective Geometryの導出
- canonical SplitRelation候補とIntersection interaction candidateの導出
- Cell配置
- その他の幾何計算

## 8. 派生Geometry

ユーザー入力や設定から再計算可能なGeometryは、原則として元データから導出する。

現在は主に次を含む。

- Symmetryによる生成Segment
- split relationによるFragment
- Layout展開後のSegment

交点座標とSegment parameterは保存対象ではない派生Geometryとし、基本Segment、Symmetry、canonicalなSplitRelationとそこから導出されるconcrete instance pairから再計算する。IntersectionAnchorは座標そのものではなくconcrete SegmentInstanceRef pairを参照する論理identityであり、Geometry上の交点とは区別する。Layout層はsplitの意味論や交差計算を扱わない。

Design Geometry / IntersectionAnchorは、source Segment、Symmetry、既存SplitRelationから解決する設計上の論理境界である。MaterialExclusionの境界解決とEditor上のLogicalFragment選択はDesign Geometryを利用し、exclusion自身を適用した結果によってDesign IntersectionAnchorを自動消滅させない。

Effective GeometryはMaterialExclusionを反映した「実際に材が存在するGeometry」であり、Effective intersectionはそのGeometry同士から得て新規intersection候補・新規split候補の判定に利用する。Design IntersectionAnchorとEffective intersectionは別責務とする。

派生Geometry上の完全重複は、ユーザー入力の不正とは分けて扱う。Geometry上の一致・重複を検出しても、それを理由に論理identityを自動統合・削除・付け替えしない。意味上異なる部材や区間が重なる場合は、必要に応じてGeometry診断として警告し、解消はユーザー操作へ委ねる。

一方、ゼロ長区間のように実Geometryとして意味を持たない解決結果はGeometry化しない。また、SymmetryやLayoutから派生した同一Geometryの重複を描画・加工出力で正規化する必要がある場合も、元の論理identityを破壊しない境界で行う。

## 9. テスト設計

### 9.1 テストの目的と根拠

テストは現在の実装結果を保存するものではなく、意図的に維持する契約を検証する。各test caseは、`docs/spec.md` のプロダクト・ドメイン上の契約、またはこの文書の長寿命な設計上の契約・不変条件のいずれかを根拠とする。根拠がない振る舞いを固定せず、維持すべき振る舞いなら正本へ契約を追加してから、または同じ変更でテストする。

テスト対象は次のとおりとする。

- ユーザーから観測できる仕様上の振る舞い
- モジュール境界、座標変換、ドメイン上の不変条件などの設計契約
- バグ修正で明らかになった、本来維持すべき契約のRegression test

内部配列の順序、privateな中間データ、特定アルゴリズム、内部IDの生成規則、同等の振る舞いを実現できるデータ表現、偶然のDOM構造は、それ自体が契約でない限り固定しない。snapshotや全体一致も、すべての差分が契約上意味を持つ場合に限り使用し、通常は必要な観測可能結果だけをassertする。

### 9.2 Test Contract ID

自動テストの根拠となる段落の直前に、次の形式で一意なTest Contract IDを定義する。

```md
<!-- test-contract: {SPECまたはARCH}-{意味のある名前} -->
```

- `SPEC-*` は `docs/spec.md`、`ARCH-*` は `docs/architecture.md` にだけ定義する。
- IDは連番ではなく、大文字英数字とハイフンによる意味のある安定した名前とする。
- 見出しや文章の移動では変更せず、契約の廃止・分割・統合時にだけ見直す。
- test caseは `contractTest` のmetadataに正本で定義済みのIDを文字列リテラルとして宣言する。
- Bug Issueに由来するRegression testは、契約に加えて正のIssue番号を `regression` に記録する。Issueは追加理由の履歴であり、契約の正本にはしない。

### 9.3 レイヤー別の責務

geometry / pattern / layoutはReactなしでUnit Test可能にし、pure function、ドメイン上の振る舞い、不変条件、境界条件を中心に検証する。浮動小数点Geometryは完全一致ではなく、契約上意味のある許容誤差を使用する。

React UIのテストは、ユーザー操作とドメイン操作の接続、ユーザーに見える状態変化、UIにだけ存在する契約を対象とする。Geometryの数値計算など、ドメイン層で検証済みの契約をUI経由で重複して検証しない。

### 9.4 テスト失敗時の判断

Test Contract IDから正本を確認し、次のいずれかとして扱う。

1. 契約が有効で実装が破った場合は、デグレとしてコードを修正する。
2. 意図した仕様・設計変更の場合は正本を更新し、契約の意味に応じてIDを維持・分割・廃止してテストも更新する。
3. assertionが契約外の実装詳細を固定していた場合は、契約に必要な範囲へテストを修正または削除する。

### 9.5 機械検証とレビューの境界

Test Contract validationは、正本内のIDの一意性とprefix、全test caseのID宣言、参照先の存在、生のVitest Test APIの不使用、Regression Issue番号が正の整数であることを機械検出する。Unit TestとBuildもCIで実行する。

一方、assertionが契約を実際に検証しているか、境界条件が十分か、実装詳細を間接的に固定していないか、契約を置く正本が適切か、Regression testが本来の契約を表すか、不要な重複がないかは静的検査では判断せず、レビューで確認する。機械検証は良いテストを完全判定するものではなく、根拠を追跡できる構造を保証する。

このvalidatorは、人間やCodexによる通常の開発で、契約IDの付け忘れ、存在しない契約の参照、生のTest API、不正なRegressionメタデータなどを検出するための規約検査である。意図的なあらゆる迂回を防ぐセキュリティ境界ではなく、その目的でimport graph解析や型解決を備えた複雑な静的解析器へ拡張しない。

## 10. 永続化とスキーマ

保存形式を導入する場合、ドキュメント全体に1つの `schemaVersion` を持たせる方針とする。

Cell Pattern / Layoutごとのサブスキーマversionは原則として持たない。具体的な保存形式・migrationは対応するGitHub Issueで設計する。

Generatorのアルゴリズムversionは保存スキーマversionとは別概念として扱う。

これらは将来機能一覧ではなく、すでに確定した設計上の関係として記録する。

## 11. 設計変更の記録

プロダクト上の現在の意味や振る舞いを変える場合は `docs/spec.md` を更新する。

モジュール境界、座標系、永続モデルなど長寿命な技術設計を変える場合はこの文書を更新する。

将来実施する個別作業や拡張候補はGitHub Issueへ記録する。既知の拡張が現在の設計判断へ影響する場合は、Issueへ `design-context` と適切な `area:*` ラベルを付ける。
