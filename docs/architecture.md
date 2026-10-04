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
    symmetry.ts            # logical Anchorを含むSymmetry transform algebra、派生Segment展開
    segmentFamily.ts       # Segment Family canonicalization、instance basis mapping
    intersectionAnchor.ts  # concrete instance pairのcanonical identity
    designGeometry.ts      # SplitRelation orbit、Anchor / Fragment Design Geometryの導出・解決
    materialExclusion.ts    # MaterialExclusionの正規化、Fragment操作、Effective Geometryの導出
    patternOperations.ts    # Pattern状態遷移とinvariant回復
    splitCandidates.ts      # Design / Effective Geometryを用いるsplit候補導出
    splitting.ts           # 上記moduleの公開互換entry point
  layout/
  components/
  app/
```

### geometry

正三角形、Point、PointSegment、交差判定、鏡映、回転、Segment parameterなど、UIに依存しない幾何計算を担当する。Geometry層は論理identityの所有者にならず、Pattern層から与えられた論理情報を座標・幾何構造へ解決するpureな計算を提供する。

### pattern

Cell Patternの論理モデルを担当する。Anchor参照、source Segment、Segment instance identity、SplitRelation、IntersectionAnchor、Fragment境界、MaterialExclusionなどの論理identityと依存関係はPattern側の責務とし、Symmetry等による派生Segment生成、Design Geometry、Effective Geometryへの解決を編成する。

Anchorやsource Segmentの型はPatternの論理モデルに置き、PatternからGeometryのpure functionを利用する。GeometryからPatternの論理型へ依存させない。全Anchorのunionである `AnchorRef`、source Segment端点に現在許可する `SegmentEndpointAnchor`、その専用resolverである `resolveSegmentEndpoint` を名前でも区別する。

Pattern内部では、Symmetryの離散transformに関する列挙・合成・逆変換・相対化、logical Anchor作用、Geometry適用を `symmetry` の責務へ集約し、`segmentFamily`、`designGeometry`、`materialExclusion`、`patternOperations`、`splitCandidates` がSymmetry種別ごとの分岐を個別に持たない。`symmetry` はGeometry層のpureな回転・鏡映primitiveを利用してよいが、Geometry層へPatternのSymmetry型やlogical identityを持ち込まない。

その上で依存方向は `symmetry` → `segmentFamily` → `designGeometry` → `materialExclusion` → `patternOperations / splitCandidates` とする。`segmentFamily` はlogical Segment definitionからFamily、canonical concrete instance、basis mappingを導出する。`designGeometry` が公開するSplitRelation orbitはPattern文脈を受け取り、source stabilizerを反映したcanonical concrete pairだけを返す。canonicalization途中のraw transform pair列挙は外部へ公開しない。`designGeometry` はsource Segment、Symmetry、既存SplitRelationだけからDesign Geometryを導出し、MaterialExclusionやEffective Geometryへ依存しない。`materialExclusion` はDesign Geometryを利用して正規化とEffective Geometryを導出する。`patternOperations` はFamily、SplitRelation、MaterialExclusionのinvariantを一連の状態遷移として回復し、`splitCandidates` はDesign GeometryとEffective Geometryを使い分ける派生候補を担当する。公開互換entry pointからのre-exportを除き、この依存方向を逆転させたり循環させたりしない。

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

Geometry一致をすべてのdomain objectへ一律に適用するidentity規則にはしない。canonicalizationの意味はdomainごとに定義する。

- Segment / Segment instanceは、同じ論理Segment定義または現在のSymmetry上で同じSegment Family / concrete instanceを表す場合にcanonicalizeする。
- IntersectionAnchorは、同じPointへ解決されても参照するcanonical SegmentInstanceRef pairが異なれば別identityを維持する。
- SplitRelation、Fragment、MaterialExclusionは、それぞれが参照するcanonical Segment identityと論理境界に基づいて正規化する。

状態遷移で新状態へのlogical mappingを明示的に定義できる場合は、そのmappingを使って依存参照を移行してよい。mappingを定義できないidentityが消滅した場合は依存データも削除する。単なるPoint / PointSegmentの座標一致や近似を根拠に、別identityへ参照を付け替えたり復活させたりしない。

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

端点2つをSegment identityとしない理由は、端点編集だけでSegment自体のidentityが失われ、SplitRelation等の参照が不要に連鎖して変化するためである。また、将来IntersectionAnchorを端点として許可した場合、IntersectionAnchorがSegmentInstanceRefを参照するため、端点構造からSegment identityを再帰的に定義するとidentity自体へ循環参照を持ち込み得る。安定したIDと現在の定義を分離し、端点pairはSegment definition / family equivalenceの判定には利用しても論理identityそのものにはしない。

同一Anchorを始点・終点に持つ退化Segmentは基本入力として作成しない。

#### Segment definitionとSegment Family canonicalization

<!-- test-contract: ARCH-PATTERN-SEGMENT-FAMILY-CANONICALIZATION -->
現在source Segment端点として許可する `SegmentEndpointAnchor` は、VertexまたはEdge Division Anchorの論理参照である。Segment definitionは始点・終点の順序を持たない2 Anchorのpairとして比較する。同じAnchor pairを逆順で持つSegmentは同一定義とする。

SymmetryによるFamily判定は、PointSegmentへ解決した浮動小数点座標の近似比較ではなく、Symmetry transformを論理Endpoint Anchorへ作用させた結果から行う。Vertexはtransformによる頂点置換として、Edge Division Anchorは変換後edgeとその向きに応じたindexへ写す。edge向きが反転する場合は `index` を `divisions - index` へ対応付け、`divisions` 自体は維持する。この論理Anchor作用もSymmetry固有知識として `symmetry` 境界へ集約し、Pattern状態遷移側へSymmetry種別分岐を複製しない。

1つのsource Segmentへ現在のSymmetryの全transformを作用させ、得られるunordered Segment definitionの重複を除いた集合をそのSegment Family orbitとする。同じorbitを持つ複数source SegmentをCellPatternへ保持しない。異なるAnchor identityがたまたま同じPointへ解決されるだけでは同一definition / familyとみなさない。将来新しいSegmentEndpointAnchor種別を許可する場合も、Geometry近似へfallbackせず、そのAnchor種別に対するlogical Symmetry actionを定義してからFamily canonicalizationへ参加させる。

複数の既存sourceが同じFamilyへ収束した場合のrepresentativeは、配列順・描画順・最初に検出したGeometryへ依存させない。既存sourceのidentity Segment definitionに決定的な全順序を与えて代表を選び、同一定義の場合だけ安定したSegmentIdをtie-breakに利用する。新規Segment追加時に既存Familyと一致した場合は、新規sourceへ代表を入れ替えず、既存Familyをそのまま維持する。

canonicalizationでは各旧sourceについて、representative source上のどのtransformへidentity instanceが対応するか、および端点方向がpreserve / reverseのどちらかを `SegmentInstanceBasisMapping` として導出する。複数transformが同じdefinitionへ作用するstabilizerがある場合は、後述するcanonical concrete transformを選ぶ。

source Segmentを追加するPattern APIは、同一unordered Anchor pairと現在のSymmetry上のFamily重複を同じinvariantとして検証し、重複する新規sourceを追加しない。Symmetry変更も返却前に同じFamily invariantを回復する。React / Appが `segments` 配列へ直接appendしてこの検証を迂回しない。

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

ただし、rawなSymmetry transformとconcrete Segment instanceは1対1とは限らない。同一sourceへ異なるtransformを作用させても、論理Endpoint Anchor pairとして同じSegment definitionになる場合、そのtransform群は同じconcrete instanceを表す。代表transformはSymmetry algebraの決定的なtransform順序 / canonical keyから1つ選び、`SegmentInstanceRef` にはそのcanonical transformだけを用いる。

例としてmirrorでsource Segmentが自己一致する場合、`identity` と `mirror` を2つのSegment instanceとして生成せず、canonicalな1 instanceだけを生成する。軸上にある場合だけでなく、鏡映によってstart / endが入れ替わる場合も同じunordered Segment definitionとして扱う。

このsource依存の重複除去はSymmetry transform algebra自体を縮小するものではない。algebraは常にSymmetryの全raw transformを保持し、Segment instance側でsourceのstabilizerによる同値類をcanonical concrete transformへ射影する。

#### Symmetry transform algebra

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

#### Segment instance mapping

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

旧sourceの任意のinstance transform `g` は、`compose(toTransform, g)` によって新source側のraw instance transformへ写す。sourceのstabilizerによって複数raw transformが同じconcrete instanceを表す場合は、さらにrepresentative source上のcanonical concrete transformへ射影する。SplitRelationの移行ではtarget / cutterそれぞれのinstanceをこの共通写像で移した後、写像後の2 concrete instanceからrelative transformを再計算する。rotationalのstep加減算やmirrorのXORをmigration側へ直接実装しない。

instance mappingは**同一Symmetry文脈内のlogical mapping**とする。Symmetry変更では、まずnext Symmetryを採用した文脈でsource Family canonicalizationとmappingを構築し、そのmappingへ引き継ぎ可能な旧relation / boundaryを入力する。旧relativeTransformがnext Symmetryでそもそも表現不能な場合はmappingによる別種類への推測変換を行わない。

Geometry上で近いinstanceを探してmappingを推測しない。また、mappingが定義できない参照を同じ位置に見える別identityへ自動付け替えしない。

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

相対transformの正規化・inverse・orbit展開は前節のSymmetry transform algebraを利用する。SplitRelation側で `none / mirror / rotational` ごとの算術や対応表を持たない。target transformを `t`、cutter transformを `c` としたrelativeはalgebra上の `compose(inverse(t), c)` から導出し、orbit展開時は各target transformとrelativeに対応するalgebra要素を合成してcutter transformを得る。

現在の外部意味は従来どおり、`none` では `identity`、mirrorでは `identity / mirror`、rotationalでは `identity / rotation +1 / rotation +2` を表現する。この列挙は保存モデルの意味であり、計算ロジックを各利用箇所へ分散させる根拠にはしない。

raw relationをorbit展開するときは、各target / cutter raw transformをsourceごとのcanonical concrete SegmentInstanceRefへ射影し、同じdirected concrete pairを重複除去する。sourceのstabilizerによって異なるrelativeTransformが同じdirected concrete pair orbitを表す場合、それらは同じSplitRelation semanticsである。表現可能なrelativeTransformを決定的な順序で比較し、同じcanonical concrete pair orbitを表すもののうち1つだけをcanonical relativeTransformとして保存する。

この正規化により、同じorbit内のどのconcrete pairから操作しても同じSplitRelationになる。保存上のrelation identityはcanonicalize済みの `targetSegmentId / cutterSegmentId / relativeTransform` の組とし、操作時に選ばれた代表pairやraw transformを保存しない。同じcanonical concrete pair orbitを重複保持しない。

relationは有向である。逆向きrelationはcanonical concrete pair orbitのtarget / cutterを反転したorbitとして扱う。raw relativeTransformはalgebra上のinverseから導出し、source stabilizerがある場合は反転後のpair orbitに対するcanonical relativeTransformへ再正規化する。stabilizerの影響がない現在の通常例ではrotationalの `+1` と `+2` は互いに逆、mirrorとidentityはそれぞれ自身が逆元となる。逆向きrelationは元relationとは別のrelationとして共存できる。

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

#### Symmetry変更と状態遷移

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

<!-- test-contract: ARCH-PATTERN-LOGICAL-DEPENDENCY-CLEANUP -->
状態遷移では、論理identityを維持できる写像が明示的に定義されている場合だけ依存参照を維持する。Segment Family canonicalizationが導出するsource / instance mappingは明示的なlogical mappingであり、SplitRelationやMaterialExclusionのsource-relative参照をcanonical identityへ移すために利用する。

mappingを定義できずSegment instanceが消滅する場合、そのinstanceを参照するIntersectionAnchorも消滅し、さらにそのAnchorを必要とする下位の論理情報を依存関係に従って削除する。削除された依存情報は、後からGeometry上で同じ位置・形状の要素が再び現れても自動復活させない。

Symmetry変更で旧relationを引き継げるか、source統合で新しいrelationへ移行できるか、旧concrete IntersectionAnchorそのものを維持できるかは別に判定する。新しいAnchorはcanonical SegmentInstanceRef pairから再導出し、Point一致や近似から旧Anchorを付け替えない。

#### Split candidateとIntersection interaction candidate

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

Reactはdivision数、Segment作成途中のAnchor、Canvas上の現在選択、一意にhit testできなかった候補集合など一時的な操作状態を所有してよい。一方、CellPatternのSymmetry、SplitRelation、MaterialExclusionを変更するときの正規化・依存削除・不変条件回復はPattern層のドメイン操作へ委譲する。Reactから永続配列を便宜的に直接差し替えて不変条件を迂回しない。SegmentEndpointAnchorはオブジェクト選択中もSegment作成操作として利用可能にし、1点目のAnchor選択時はEditorSelectionを解除してSegment作成途中状態へ移る。

<!-- test-contract: ARCH-EDITOR-SELECTION-STATE -->
Cell Editorの選択状態は、永続モデルとは分離した一時状態として少なくとも次の意味を表せる構成とする。

```ts
type EditorSelection =
  | { kind: 'segment'; segment: SegmentInstanceRef }
  | { kind: 'intersection'; candidate: IntersectionInteractionCandidate }
  | { kind: 'fragment'; fragment: LogicalFragment }
  | null
```

Segment作成途中、EditorSelection、Canvas上で曖昧だった候補集合はトップレベルでは排他的な一時interaction stateとして表現し、複数を独立して同時保持できないことを不変条件とする。ただし曖昧候補状態は、開始済みgestureを継続するためのcontextを内包してよい。Segment終点の候補選択では開始Anchorをcontextとして保持し、Anchor決定時に同じ状態遷移からSegment作成commandを返す。候補集合とgesture contextはEditor専用でありCellPatternへ永続化しない。選択解除時は作成途中のAnchor、曖昧候補、cutter highlightなど、そのinteractionに従属する一時状態も破棄する。Pattern状態遷移後も同じ論理identityが存在する場合だけselectionまたは候補を維持し、identityが消滅した場合は解除する。候補が1件へ減っても自動選択せず、保持したgesture contextとともに明示選択を待つ。Geometry一致する別identityへ自動で付け替えない。

<!-- test-contract: ARCH-EDITOR-HIT-TEST-PRIORITY -->
Canvasの通常hit testではSegmentEndpointAnchor、選択中target上のIntersection marker、選択中SegmentのFragment、その他Segment、Canvas背景の優先関係を利用してよい。Anchorは現在のEditorSelectionにかかわらずSegment作成対象とする。ただし、この優先関係は曖昧なlogical candidateを必ず1対象へ潰す規則ではない。同一点、完全重複、十分なtap area同士の競合などCanvas上で安定して選び分けられない場合は、logical identityを失わない候補集合をInspectorへ渡す。

priorityによって下位のlogical targetがCanvas上の全操作位置から到達不能になってはならない。line targetのGeometry全体が上位point targetのscreen-space hit areaに覆われる場合は、そのline targetも曖昧候補としてInspectorへ渡す。一方、上位hit area外に直接操作可能な領域が残るline targetは通常のpriorityに従い、上位target操作のたびに候補へ混ぜない。到達可能性の具体的な計算法は長寿命なArchitecture contractとしない。

pointer / tapのlogical hit resolutionはCanvas surfaceの1つの入口へ集約する。resolverはpointer位置、現在のAnchor・Intersection・選択中Fragment・Segment instance、およびviewBoxから実画面への変換を受け取り、screen-spaceのtap半径内にある候補を導出する。個別SVG要素のDOM hit testや描画順をlogical targetの決定に利用しない。keyboard操作はfocusされたAnchorが明示済みなので、そのAnchorを直接操作してよい。

Cell EditorのSVGは、pattern line、ghost、選択highlight、markerなどの表示Geometryと、pointer位置からlogical candidateを判定する責務を分離する。表示Geometryはpointer eventを受けない。具体的なDOM構造やmarker形状、透明stroke幅は長寿命な契約にせず、縮小表示時にもresolverが実画面上で十分なtap areaを判定することを契約とする。同一点や近接するAnchorとIntersectionをCanvas上の精密な狙い分けで解決してはならない。

材なしFragmentはEffective Geometryには存在しないため、Cell EditorではDesign Geometry由来の編集用ghost / hit areaを常時提供する。Segment全体が材なしでEffective Geometryが空でも、そのDesign GeometryからSegmentを再選択できなければならない。hit areaのSVG要素構造や具体サイズは契約にしない。

同一点に複数Intersection interaction candidateがある場合は、Pointを1つの論理候補へ統合せず、UI一時状態の候補集合としてInspectorへ渡す。候補選択後は通常のIntersection selectionへ遷移し、選択中candidateのcutter Segment instanceをCanvas上でhighlightする。

有効なCellPatternでは、同一Segment Familyのsource重複および同一sourceのstabilizerによる完全重複Segment instanceをPattern層でcanonicalizeするため、それらをCanvas候補として選び分けることを通常のUI契約としない。malformed / legacy / 状態遷移途中の入力を防御的に表示する場合でも、UI上の重複除去をPattern canonicalizationの代替にしない。

<!-- test-contract: ARCH-EDITOR-INSPECTOR-BOUNDARY -->
Cell Editor下部は候補一覧の所有者ではなく、現在のEditorSelectionを表示・操作するInspectorとする。Canvasは「どの論理対象を操作するか」を選ぶ主操作面、Inspectorは「選択対象が現在どの状態で、どの状態遷移を実行できるか」を明示する面として責務を分ける。

Segmentのsource family削除、Intersectionのsplit追加・解除、Fragmentの材なし・材ありへの変更などCellPatternを変更する操作はInspectorからPattern層の状態遷移APIを呼ぶ。Symmetry生成instanceを選択した削除も、concrete instance単体ではなくsource Segment削除としてPattern層へ渡す。Canvas上の選択操作だけでCellPatternを暗黙変更しない。将来、操作手数を減らすショートカットを追加しても、同じPattern APIを利用し、この責務境界を迂回しない。

SplitRelation解除により依存MaterialExclusionが連動削除される場合、UIは解除前にPattern層から影響を導出してInspectorへ表示し、確認を経て状態遷移を実行する。依存exclusionがない解除では確認を必須にしない。影響計算は現在のcanonical MaterialExclusionを基準とし、正規化前のユーザー操作履歴を保持・復元する設計にはしない。

コンポーネントは計算済みモデルとcallbackを受け取り、次の処理をドメイン層へ委譲する。

- source Segment追加時のSegment Family検証・canonicalization
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

派生Geometry上の一致はdomain semanticsに従って扱う。Segmentについては、論理Endpoint AnchorとSymmetry actionから同じFamily / concrete instanceと判定できる完全重複をPattern層でcanonicalizeする。一方、異なるIntersectionAnchor、Fragment境界、その他の論理対象をPoint / PointSegmentの座標一致だけで統合・削除・付け替えしない。意味上異なる部材や区間がGeometry上で重なる場合は、必要に応じてGeometry診断として扱い、座標一致をidentity規則へ昇格させない。

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
