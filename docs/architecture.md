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

ユーザーが定義した基本Segment群とSymmetry等の設定を持つ。

<!-- test-contract: ARCH-PATTERN-DERIVED-SEGMENTS -->
対称展開されたSegmentは基本Segment配列へ複製せず、表示時の派生データとして扱う。ユーザー入力の基本Segmentと対称操作による派生Segmentは区別できるようにするが、その具体的なデータ表現は契約としない。

### CellPlacement

基準CellのLocal CoordinateをPreview座標へ写す配置情報を表す。

少なくとも位置、回転、必要に応じてmirrorを表現できること。

## 5. 座標と変換

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

Reactはdivision数、選択中AnchorPoint、基本Segment群、Symmetry等の操作状態を所有してよい。

コンポーネントは計算済みモデルとcallbackを受け取り、次の処理をドメイン層へ委譲する。

- AnchorPointから座標への解決
- mirror / rotational変換
- Cell配置
- その他の幾何計算

## 8. 派生Geometry

ユーザー入力や設定から再計算可能なGeometryは、原則として元データから導出する。

現在は主に次を含む。

- Symmetryによる生成Segment
- Layout展開後のSegment

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

Test Contract validationは、正本内のIDの一意性とprefix、全test caseのID宣言、参照先の存在、生の `test()` / `it()` の不使用、Regression Issue番号が正の整数であることを機械検出する。Unit TestとBuildもCIで実行する。

一方、assertionが契約を実際に検証しているか、境界条件が十分か、実装詳細を間接的に固定していないか、契約を置く正本が適切か、Regression testが本来の契約を表すか、不要な重複がないかは静的検査では判断せず、レビューで確認する。機械検証は良いテストを完全判定するものではなく、根拠を追跡できる構造を保証する。

## 10. 永続化とスキーマ

保存形式を導入する場合、ドキュメント全体に1つの `schemaVersion` を持たせる方針とする。

Cell Pattern / Layoutごとのサブスキーマversionは原則として持たない。具体的な保存形式・migrationは対応するGitHub Issueで設計する。

Generatorのアルゴリズムversionは保存スキーマversionとは別概念として扱う。

これらは将来機能一覧ではなく、すでに確定した設計上の関係として記録する。

## 11. 設計変更の記録

プロダクト上の現在の意味や振る舞いを変える場合は `docs/spec.md` を更新する。

モジュール境界、座標系、永続モデルなど長寿命な技術設計を変える場合はこの文書を更新する。

将来実施する個別作業や拡張候補はGitHub Issueへ記録する。既知の拡張が現在の設計判断へ影響する場合は、Issueへ `design-context` と適切な `area:*` ラベルを付ける。
