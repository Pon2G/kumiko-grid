# アーキテクチャ

この文書は、組子グリッドの長寿命な技術設計を定義する正本とする。個別機能の実装予定や進捗、既知の拡張候補そのものはGitHub Issueで管理する。

## 1. 設計原則

- Cell PatternとLayoutを独立させる。
- geometry、pattern、layoutのドメインロジックをReact UIから分離する。
- 幾何学計算は可能な限りpure functionとして実装する。
- 永続データには意味のある相対表現を保持し、描画座標は導出する。
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
  pattern/
  layout/
  components/
  app/
```

### geometry

正三角形、Point、AnchorPointの座標解決、Segment、鏡映、回転など、UIに依存しない幾何計算を担当する。

### pattern

Cell Patternのモデルと、Symmetry等による派生Segment生成を担当する。

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

Pointは描画・計算用であり、ユーザーが定義するAnchorPointの永続表現そのものではない。

### Triangle

基準Cellの3頂点を持つ。

正規化した上向き正三角形を基準とする。

- A = (0.5, 0)
- B = (0, sqrt(3) / 2)
- C = (1, sqrt(3) / 2)

### AnchorPoint

頂点を表す `vertex` と、辺上のn等分点を表す `edge-division` のdiscriminated unionを基本とする。

Edge Division Pointは座標を保存せず、edge、divisions、indexから解決する。

### Segment

安定したIDと始点・終点のAnchorPointを持つ。

同一AnchorPointを始点・終点に持つ退化Segmentは基本入力として作成しない。

### CellPattern

ユーザーが定義した基本Segment群、Symmetry、および有効なSplitRelationを持つ。

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

#### SplitCandidate

<!-- test-contract: ARCH-PATTERN-SPLIT-CANDIDATE-DERIVATION -->
SplitCandidateは保存データではなく、選択中のtarget source Segmentについて現在成立するcanonical SplitRelation候補と表示用交点をまとめた派生情報とする。

candidate生成は、concrete instance pairの列挙順からrelation identityを決めるのではなく、target source、cutter source、現在のSymmetryで表現可能なrelativeTransformからcanonicalなrelation候補を列挙し、それぞれのorbitを展開・検証して有効な候補だけを返す。これによりSymmetry展開配列の順序や最初に発見された交点へidentityを依存させない。

同一candidateのorbit内で複数pairがGeometry上同一点に交差する場合、表示用Pointは共通Geometry toleranceに従って重複除去してよい。ただしPointの重複除去はrelationの重複除去ではない。異なるSplitRelation候補が同じ座標を持っていてもcandidateを統合せず、座標をrelation identityとして利用しない。

#### Fragment Geometryの導出

<!-- test-contract: ARCH-PATTERN-SPLIT-DERIVATION -->
Pattern層は、有効なCellPatternから最終Geometryをpureに導出する。SplitRelationをSymmetry orbitのconcrete instance pairへ展開し、各target instanceについてrelationから得られる有効なtarget parameterをGeometry層へ渡してFragment化する。Geometry導出はCellPatternやSplitRelationを追加・削除・修復しない。

```text
source model
  ↓
Symmetry expansion + SegmentInstanceRef
  ↓
canonical SplitRelation
  ↓
symmetry orbit / concrete instance pairs
  ↓
split parameter derivation
  ↓
Fragment geometry
  ↓
Layout
```

Fragmentと交点座標は再計算可能な派生Geometryであり、CellPatternへ保存しない。Fragmentの `fragmentIndex` 等の派生順序を永続identityとして扱わない。SplitRelationから安定したconcrete `SegmentInstanceRef` pairを導出できるところまでをこのモデルの責務とし、同一座標にある複数pairを1つの論理交点へ統合する規則はここでは定義しない。

### CellPlacement

基準CellのLocal CoordinateをPreview座標へ写す配置情報を表す。

少なくとも位置、回転、必要に応じてmirrorを表現できること。

## 5. 座標と変換

### Segment intersection

<!-- test-contract: ARCH-GEOMETRY-SEGMENT-INTERSECTION -->
Geometry層は、正規化Cell Local Coordinate上の2つの非退化Segmentについて、UIに依存しないpure functionで交差関係を判定する。結果は、交差しない `none`、双方の内部で1点交差する `cross`、少なくとも一方の端点で1点を共有する `touch`、同一直線上で有限長の共通区間を持つ `overlap` を区別する。同一直線上で共有するのが1点だけの場合は `touch` とする。`cross` と `touch` は交点と双方のSegment parameter（始点を0、終点を1）を返す。

浮動小数点の判定は完全一致に依存せず、共通epsilonを正規化Cell Local Coordinate上の距離許容誤差として用いる。外積やSegment parameterなど座標距離と異なるスケールの量を比較するときは、その量に対応する許容値へ変換する。epsilonはGeometry上の数値解像度であり、その範囲内の差異を独立した位置や境界として区別しない場合があるが、source Segmentの有効性を決める閾値にはしない。epsilonの具体値、変換式、交差判定アルゴリズムは契約としない。基本Segmentは非退化であるという現在の不変条件を前提とする。

<!-- test-contract: ARCH-GEOMETRY-SEGMENT-FRAGMENTATION -->
Geometry層は、PointSegmentと複数のparameter位置からFragmentを生成するpure functionを提供する。Segment内部の位置だけをSegment上の順序で用い、始点・終点およびepsilon内で同一点とみなせる重複位置ではFragmentを増やさず、ゼロ長Fragmentを生成しない。有効なsplit境界が存在しない場合は、source Segmentと同じGeometryを1つのFragmentとして保持する。入力Segmentは変更しない。

Edge Division Pointは辺の始点から終点への線形補間で求める。

<!-- test-contract: ARCH-GEOMETRY-MIRROR-MEDIAN -->
mirrorは選択した頂点と対辺中点を結ぶ中線に対して両端点を鏡映する。

<!-- test-contract: ARCH-GEOMETRY-ROTATION-CENTROID -->
rotationalは正三角形の重心を中心として120°、240°回転する。

<!-- test-contract: ARCH-LAYOUT-LOCAL-COORDINATE -->
下向きCellでもAnchorPoint自体の意味は変えない。基準CellのLocal Coordinateを配置変換して向きを表現する。

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

Reactはdivision数、選択中AnchorPoint、split対象などの操作状態を所有してよい。一方、CellPatternのSymmetryやSplitRelationを変更するときの整合性維持はPattern層のドメイン操作へ委譲する。Reactから `symmetry` や `splitRelations` を便宜的に直接差し替えて不変条件を迂回しない。

コンポーネントは計算済みモデルとcallbackを受け取り、次の処理をドメイン層へ委譲する。

- AnchorPointから座標への解決
- mirror / rotational変換
- SplitRelationの正規化、検証、Symmetry変更時の再検証
- split候補とFragment Geometryの導出
- Cell配置
- その他の幾何計算

## 8. 派生Geometry

ユーザー入力や設定から再計算可能なGeometryは、原則として元データから導出する。

現在は主に次を含む。

- Symmetryによる生成Segment
- split relationによるFragment
- Layout展開後のSegment

交点は保存対象ではない派生Geometryとし、基本Segment、Symmetry、canonicalなSplitRelationとそこから導出されるconcrete instance pairから再計算する。Layout層はsplitの意味論や交差計算を扱わない。

派生Geometry上の完全重複は、ユーザー入力の不正とは分けて扱う。必要になった段階で、描画や出力など適切な境界で正規化する。

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
