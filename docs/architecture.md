# アーキテクチャ

この文書は、組子グリッドの長寿命な技術設計のcanonical entry point兼overviewとする。個別機能の実装予定や進捗、既知の拡張候補そのものはGitHub Issueで管理する。詳細正本はこの文書から影響領域ごとに辿り、すべての詳細文書を常に読むことは要求しない。

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

### Pattern詳細

Pattern domainの詳細Architectureは [`docs/architecture/pattern.md`](architecture/pattern.md) を正本とする。
Anchor / Segment identity、Segment Family canonicalization、Segment instance / Symmetry algebra、SplitRelation、Intersection / Fragment、MaterialExclusion、Design Geometry / Effective Geometryの詳細はそちらへ置き、このoverviewではmodule boundaryとdomain間依存方向だけを保持する。

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

テストは現在の実装結果を保存するものではなく、意図的に維持する契約を検証する。各test caseは、`docs/spec.md` のプロダクト・ドメイン上の契約、または `docs/architecture.md` から辿れるArchitecture正本の長寿命な設計上の契約・不変条件のいずれかを根拠とする。根拠がない振る舞いを固定せず、維持すべき振る舞いなら正本へ契約を追加してから、または同じ変更でテストする。

テスト対象は次のとおりとする。

- ユーザーから観測できる仕様上の振る舞い
- モジュール境界、座標変換、ドメイン上の不変条件などの設計契約
- バグ修正で明らかになった、本来維持すべき契約のRegression test

内部配列の順序、privateな中間データ、特定アルゴリズム、内部IDの生成規則、同等の振る舞いを実現できるデータ表現、偶然のDOM構造は、それ自体が契約でない限り固定しない。snapshotや全体一致も、すべての差分が契約上意味を持つ場合に限り使用し、通常は必要な観測可能結果だけをassertする。

### 9.2 Test Contract ID

Test Contract IDは、Architecture上重要な文章すべてへ付けるラベルではなく、自動testが正本上の根拠を直接参照するためのanchorとする。長寿命な仕様・設計説明でも、自動testの直接anchorにしない文章は正本へ残したままmarkerを付けない。

自動testの根拠となる段落の直前に、次の形式で一意なTest Contract IDを定義する。

```md
<!-- test-contract: {SPECまたはARCH}-{意味のある名前} -->
```

- `SPEC-*` は `docs/spec.md`、`ARCH-*` は `docs/architecture.md` または `docs/architecture/**/*.md` のArchitecture正本範囲にだけ定義する。`docs/architecture.md` はそのcanonical entry pointとして維持する。
- IDは連番ではなく、大文字英数字とハイフンによる意味のある安定した名前とする。
- 1つのIDは、同じ理由で一緒に変更される長寿命な契約単位とする。説明の長さだけを理由に分割しない。
- 見出しや文章の移動では変更せず、契約の廃止・分割・統合時にだけ見直す。
- 定義したIDは1件以上のtest caseから直接参照する。test caseは `contractTest` のmetadataに正本で定義済みのIDを文字列リテラルとして宣言する。
- Bug Issueに由来するRegression testは、契約に加えて正のIssue番号を `regression` に記録する。Issueは追加理由の履歴であり、契約の正本にはしない。

同じstemを持つ `SPEC-*` / `ARCH-*` があっても、前者がdomain observable semantics、後者がrepresentation / invariant / state transition mechanismを表すなど責務が異なる場合は別契約として維持する。名前だけを理由に機械的に統合しない。

### 9.3 レイヤー別の責務

geometry / pattern / layoutはReactなしでUnit Test可能にし、pure function、ドメイン上の振る舞い、不変条件、境界条件を中心に検証する。浮動小数点Geometryは完全一致ではなく、契約上意味のある許容誤差を使用する。

React UIのテストは、ユーザー操作とドメイン操作の接続、ユーザーに見える状態変化、UIにだけ存在する契約を対象とする。Geometryの数値計算など、ドメイン層で検証済みの契約をUI経由で重複して検証しない。

### 9.4 テスト失敗時の判断

Test Contract IDから正本を確認し、次のいずれかとして扱う。

1. 契約が有効で実装が破った場合は、デグレとしてコードを修正する。
2. 意図した仕様・設計変更の場合は正本を更新し、契約の意味に応じてIDを維持・分割・廃止してテストも更新する。
3. assertionが契約外の実装詳細を固定していた場合は、契約に必要な範囲へテストを修正または削除する。

### 9.5 機械検証とレビューの境界

Test Contract validationは、正本内のIDの一意性とprefix、各IDが1件以上のtest caseから参照されること、全test caseのID宣言と参照先の存在、生のVitest Test APIの不使用、Regression Issue番号が正の整数であることを機械検出する。Unit TestとBuildもCIで実行する。

一方、assertionが契約を実際に検証しているか、境界条件が十分か、実装詳細を間接的に固定していないか、契約を置く正本が適切か、Regression testが本来の契約を表すか、不要な重複がないかは静的検査では判断せず、レビューで確認する。機械検証は良いテストを完全判定するものではなく、根拠を追跡できる構造を保証する。

このvalidatorは、人間やCodexによる通常の開発で、契約IDの付け忘れ、存在しない契約の参照、生のTest API、不正なRegressionメタデータなどを検出するための規約検査である。意図的なあらゆる迂回を防ぐセキュリティ境界ではなく、その目的でimport graph解析や型解決を備えた複雑な静的解析器へ拡張しない。

## 10. 永続化とスキーマ

保存形式を導入する場合、ドキュメント全体に1つの `schemaVersion` を持たせる方針とする。

Cell Pattern / Layoutごとのサブスキーマversionは原則として持たない。具体的な保存形式・migrationは対応するGitHub Issueで設計する。

Generatorのアルゴリズムversionは保存スキーマversionとは別概念として扱う。

これらは将来機能一覧ではなく、すでに確定した設計上の関係として記録する。

## 11. 設計変更の記録

プロダクト上の現在の意味や振る舞いを変える場合は `docs/spec.md` を更新する。

モジュール境界、座標系、永続モデルなど長寿命な技術設計を変える場合は `docs/architecture.md` を入口に、影響領域の正本を更新する。Pattern domainの詳細は `docs/architecture/pattern.md` を更新する。

将来実施する個別作業や拡張候補はGitHub Issueへ記録する。既知の拡張が現在の設計判断へ影響する場合は、Issueへ `design-context` と適切な `area:*` ラベルを付ける。
