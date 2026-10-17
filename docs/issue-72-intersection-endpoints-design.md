# Issue #72: IntersectionAnchor端点の実装設計

## 1. 開発起点と文書の位置づけ

- 対象: [#72](https://github.com/Pon2G/kumiko-grid/issues/72)
- ブランチ: `feature/issue-72-intersection-endpoints`
- 確認したmain: `a6f7d258baa5f95d3658eec2641ba760847e9864`
- 設計日: 2026-10-17
- このcommitは設計のみ。実装は本ブランチを引き継ぐ。

本書は#72で採用する仕様・設計と判断根拠を定める。未実装の内容を現在の正本へ先行記載しない。実装と同じPRで規範部分を `docs/spec.md`、`docs/architecture.md`、`docs/architecture/pattern.md` へ移し、本書は判断記録と正本へのリンクへ整理する。予定Test Contract IDも、その際に正本へ登録する。

## 2. 現行実装との照合と前提変更

| 確認対象 | mainの実態 | #72での判断 |
| --- | --- | --- |
| #70 / #71 | #71はmain先頭にマージ済み。選択instanceのハンドルdrag、Inspector、逆変換、atomic評価、影響確認がある | 操作・安定ID・開始Pattern基準のpreviewを引き継ぐ。#70本文の「未実装」は古い記録 |
| #68 / #69 | #69はマージ済み。Design側の有限長overlapを拒否 | 再利用するが、参照依存で動く全sourceを含めて検証する |
| `anchor.ts` / `segment.ts` | Endpoint unionはVertex / Edge Divisionのみ。resolverはPatternを必要としない | Intersectionを追加し、参照依存を解決できるPattern文脈を導入する |
| `designGeometry.ts` | `resolveIntersectionAnchor` は有効SplitRelation由来のAnchorだけ解決する | 一般の交点解決と有向split境界の存在確認を分ける |
| `symmetry.ts` / `segmentFamily.ts` | logical endpoint actionからFamily / stabilizerを決める | 参照先instanceのcanonicalizationを伴う交点作用へ拡張。座標比較へ置換しない |
| `endpointEdit.ts` | 編集sourceとothersを別々にexpand。保存relativeを継続し材指定を移行 | 単独source展開では依存端点を解決できない。完全なsource文脈で候補全体を評価する |
| `editorInteraction.ts` | Anchorは再照合せず保持しても安全な固定点だった | 作成途中のIntersection始点・候補は消滅し得る。Patternとの照合を追加する |
| #51 | DAGは将来案。現契約ではない | 今回source単位のDAGを採用。完成状態validation・汎用graph frameworkは採用しない |

確認した設計背景は#30 / #31 / #37 / #40 / #42 / #43 / #51 / #68 / #70、およびdesign-context一覧（保存・出力等はscope外）。過去Issueのconcrete pair保存案やGeometryによるFamily同一視ではなく、現在の正本にあるrelative orbit、logical Family、concrete材境界を基準とする。

#72の目的・scopeを取り消す前提変更はない。ただし「型へIntersectionを追加するだけ」では実装できず、交点lifecycle、解決順序、全体検証、Symmetry時の端点参照移行が今回必要になる。

## 3. プロダクト仕様

### 3.1 交点の意味と指定可能範囲

- 端点は既存 `IntersectionAnchor = unordered pair<SegmentInstanceRef>` を保持する。座標コピー、独立Anchor ID、独立registry、SplitRelation IDを導入しない。
- 異なるcanonical concrete instanceの有限線分同士に `cross` または `touch` があるとき、そのpairの交点は解決可能。両端点同士のtouchも許可する。同一instance pair、none、overlapは交点端点にできない。
- 同じsourceの異なる対称instanceの交点も、別sourceの端点から参照できる。参照するsource自身のinstanceを含むpairは循環規則により禁止する。
- 未splitの交点も選べる。端点利用でsplitを暗黙追加しない。端点を接続しても参照元のFragmentは増えない。材操作のための分割は従来どおり明示操作する。
- 同一点の異なるpair、Vertex / Edge Divisionと同座標のIntersectionは別identityであり、候補を座標で統合しない。

新規に端点として選択できる交点は、現在のEffective Geometryで双方に材が存在する点とする。Fragmentの端点も材あり集合に含める。split追加と違い、targetの材あり区間の「内部」である必要はない。有向targetやsplit orbitの追加可否は端点候補の条件にしない。

選択後の既存端点の有効性・追従はDesign側の線分全体で判定する。後から参照点の材を消しても接続は解除しない。材を戻せば未使用交点は再び選択可能だが、削除済みsourceを復活させない。これにより#31の新規操作のEffective基準を維持し、材と参照解決の循環を避ける。

Pattern APIも、新規追加・端点の新しい参照指定時に上記の選択条件を入力Pattern上で検証する。既存端点の継続・移行ではEffective条件を再適用しない。同じlogical端点への変更は材なしでもno-opとする。候補の表示済みフラグを信用せず現在の入力Patternで再判定する。

### 3.2 依存・追従・消滅

`S.start = intersection(A@g, B@h)` はsource SがAとBに依存することを意味する。参照方向は「利用するsource → 参照されるsource」。両端点分の参照を集めたsource graphはDAGでなければならない。AとBが同一sourceなら依存辺は1本でよい。

- 直接自己参照、複数sourceを通る間接循環を拒否する。Symmetry transformや材なしで依存を回避しない。
- 依存先を先に解決し、source配列順に依存せず有限にGeometryを導出する。
- 参照元の端点移動に伴い交点が移動した場合、同じpairへ追従する。移動が下位sourceへ連鎖することを許可する。
- 参照元source削除、交差消失、instance移行不能、pairが同一instanceへ収束した場合、その交点を端点に持つ既存sourceを丸ごと削除し、下位依存へ連鎖する。半分のSegmentや未解決端点は保持しない。
- split解除では端点依存を削除しない。既存のsplit-boundaryに依存する材指定の解除は従来どおり。
- 削除済みsource、relation、材指定のhidden履歴は持たず、Geometryの再出現による自動復活を行わない。

新規入力の不正と既存参照の喪失は区別する。新規指定が無効、循環する、または要求した編集source自身が候補結果に残れない場合は拒否する。要求sourceを消して「編集成功」にしない。

### 3.3 拒否と連鎖削除の区別

| 候補状態 | 結果 |
| --- | --- |
| 新規指定の参照なし・不正transform・選択不可・自己/間接循環 | 操作全体を拒否 |
| 編集後も同じpairの交点が存在し移動する | 依存sourceを追従 |
| 既存参照が消滅・移行不能 | 依存sourceを連鎖削除する候補を作り、UIで影響確認 |
| 解決可能な生存sourceが両端同点に退化 | 操作全体を拒否。退化sourceを自動削除して救済しない |
| 生存source / canonical instanceに有限長overlap | 操作全体を拒否。材の有無で例外化しない |
| 端点編集により生存sourceのFamily重複が発生（下位source同士を含む） | 操作全体を拒否。編集ではFamily統合しない |
| Symmetry変更によりFamilyが一致 | 既存方針どおりlogical mappingで統合。その後に全体検証 |

退化については、現在の「同一logical端点拒否」を維持し、今回新たに異なるidentityの両端がGeometry上で同点となる入力・依存移動も拒否する。Geometryの既存 `pointsAreClose` を正規化Cell座標の数値解像度判定として再利用する。新たなepsilonやユーザー向け最小部材長は導入しない。これは旧正本の「異なるidentityの同点退化は対象外」を明示的に更新する仕様変更であり、identity統合ではない。非退化を確認してから `intersectSegments` へ渡す。

拒否時には入力Pattern（source、relation、材指定、Symmetry）を全て維持する。候補で行った連鎖削除・Family統合も適用しない。

### 3.4 操作と表示

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

### 3.5 影響確認・取消し・古い候補

- 端点編集では既存の分割・境界・材指定喪失と材なし拡大に、連鎖削除されるsource件数を加える。
- source削除・Symmetry変更でも、端点依存によるsource喪失がある場合は、同じPattern評価から得たsource・分割・材の影響をInspectorに表示して確認する。追加依存喪失がない既存操作へ一律に確認を増やさない。
- Family統合で代表へ移行できたsourceは「参照消失による削除」に数えない。要求したsource削除と追加の連鎖削除を区別する。材unionによる配列件数減を喪失扱いしない。
- 確認中は元Patternを保持する。承認時に元Patternの一致を確かめ、同じ要求を再評価して一度だけ採用する。取消しは変更なし。
- 端点編集のpreview・hit候補は開始Patternを基準とし、候補Patternを次の評価基準にしない。preview中に消える依存sourceや交点を候補導出の基準へ逆流させない。
- 編集/影響確認中に外部Patternが変更されたら中断する。古い承認を新Patternへ適用しない。
- 通常の作成途中は始点Intersectionを現在Patternで再照合する。消滅したら作成contextを破棄。存続なら同じidentityの現在座標へ更新し、終点確定時に新規操作条件も再検証する。
- 曖昧候補の消滅は既存reconcile方針（previewだけ解除、残る候補維持、1件になっても自動確定しない）を維持する。別pairへ座標で付け替えない。

## 4. Pattern設計

### 4.1 データと解決責務

`SegmentEndpointAnchor` にIntersectionAnchorを加える。CellPatternへAnchor registry・座標cache・依存graph・revisionを保存しない。依存graphと解決済みGeometryは1回の評価内の派生情報とする。

既存 `resolveIntersectionAnchor` の意味をsplit存在チェックとして流用し続けない。次を明確に分ける。

1. pairが現在のsource Geometry上で一意な交点を作るかを解決する責務。split / 材に依存しない。
2. 有向SplitRelation由来の境界が現在存在するかを判定する責務。MaterialExclusionとFragmentは必ずこちらを確認する。
3. 新規端点候補としてEffective条件を満たすかを判定する責務。

`deriveIntersectionAnchors` は現状のsplit由来列挙として用途を明示する名前に整理するか、同等に用途の誤用を防ぐAPIにする。全幾何交点の列挙をFragment境界生成へ渡してはならない。一般resolverを導入してもsplit解除による材境界喪失を無効化しない。

### 4.2 循環しないモジュール境界

現在symmetryに同居するalgebra・logical canonicalization・Geometry展開を必要な範囲で分離する。

- transform algebra / 型 / primitive key: source Geometry、split、材を参照しない。
- logical Family / instance canonicalization: source定義と参照先sourceのcanonical情報を使う。参照先を先に処理する。Geometry近似を使わない。
- source Geometry解決・instance展開: DAGに沿って端点を解決し、algebraで対称展開する。splitとEffective Geometryに依存しない。
- Design Geometry: 解決済みinstanceにSplitRelationを適用して有向境界・Fragmentを導出する。
- Material / Effective Geometry: 従来どおりDesign Geometryに材状態を適用する。
- Pattern操作: 上記を編成し、完成した有効Patternと影響だけを公開する。

実際のファイル名は実装判断でよいが、`symmetry → designGeometry → symmetry` のruntime import循環や、端点resolverから高水準 `expandPattern` を再帰呼出しする構造にしない。pairの単純key/生成とalgebraが相互importする問題も避ける。低水準primitiveを小さく切り出すだけでよく、汎用graph / constraint / transaction frameworkは作らない。

expandの入力は依存closureを含むsource定義とSymmetry。SplitRelation・MaterialExclusionを必要としない。編集sourceだけ、または参照先を除いたothersだけのPatternを解決しない。評価内ではsource ID別の解決結果を共有し、同じ依存木を毎回全再帰しない。永続cacheは不要。

### 4.3 交点へのSymmetry作用・Family

交点 `I(A@g, B@h)` にtransform tを作用させるとき、両方のrefのtransformへ既存algebraのcomposeを作用させる。その後、各参照先sourceのstabilizerでcanonical instanceへ射影し、pairをunorderedに正規化する。作用の合成順は既存 `compose(a,b) = aの後にb` に従う。

primitiveなalgebraはraw refへ作用し、source文脈が必要なcanonicalizationはFamily責務側で行う。algebra自身にPattern全体の探索を持ち込まない。

Family keyはこの正規化済みlogical端点pairから導出する。Intersectionを座標へ解決してからstabilizerを決めない。依存先の自己一致により同じrefになるケースを正しく扱い、異なるpairが偶然同座標にあるだけなら別定義に保つ。その結果、Geometryだけが完全一致する異なるcanonical instanceはoverlapとして拒否される。

生成instanceから端点変更する場合は、表示先Anchorの両refへ選択instanceの逆transformを作用させる。sourceのstart/end role、raw→canonical方向、編集後selection mappingは#71の規則を維持する。

### 4.4 端点変更時の継続

候補のendpoint差替え後、循環を先に拒否する。依存先から順に以下を実施する。

1. 参照先が継続するなら保存済みsource IDとtransformをその新定義でcanonicalizeしてpairを再構成する。旧stabilizerに含まれる別raw transformを列挙して参照を増殖させない。
2. 交点を解決できない既存利用sourceを除去し、その下位へ伝播する。新規要求・編集source自身の不正は拒否。
3. 生存sourceの退化・Family重複・全canonical instance間overlapを検証する。変更されたsourceだけに限定しない。
4. 生存source間の既存relationを#71の保存relative継続規則で再正規化・検証する。消滅sourceに依存するrelationは除去する。
5. 旧有向境界の対応と材指定を移行し、既存材normalization / stabilizer closureを実施する。
6. 旧source・relation・境界・材指定ごとの対応を追跡し、完成Patternと影響を返す。

依存sourceの端点が動いてもそのSegmentIdとstart/end roleを維持する。編集sourceの変形へGeometry一致を要求するbasis mappingを流用しない。

### 4.5 Symmetry変更とFamily統合

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

### 4.6 APIとUI接続

既存 `addSegment`、`removeSegment`、`changeSymmetry` の戻り値互換を必要なく破壊しない。新しい影響確認を必要とする削除・Symmetry変更にはpureな評価APIを用意し、既存APIも同じ評価処理へ委譲する。二重のcleanup実装を作らない。端点変更は既存result unionを拡張する。

評価は `unchanged / rejected(reason) / changed(pattern, impact)` を区別できること。impactは削除source ID集合等の根拠を持ち、UIが配列長差分から連鎖喪失を推測しない。UIから任意のnextPatternを適用するsetterは公開しない。承認は確認済みの操作要求に対して行う。

新規作成の拒否理由表示が必要な場合も既存add実装を複製せず同じ評価を使う。拒否された作成ではPatternを維持し、有効な始点contextを残して別終点を選べる。始点が消失・選択不可ならidleへ戻し理由を表示する。

## 5. Test Contractと検証

以下は実装時に正本へ登録する予定ID。ここではvalidator markerを作らない。既存契約と意味が重なる箇所は既存IDを更新し、新旧の矛盾した契約を併存させない。

| 契約 | 正本 | 最小限保証する振る舞い |
| --- | --- | --- |
| `SPEC-ANCHOR-INTERSECTION-ENDPOINT` | spec | 未splitのcross/touchを新規始終点に利用、pair順序同値、異なるpair同座標は別、暗黙splitなし |
| `SPEC-ANCHOR-INTERSECTION-ENDPOINT-MATERIAL` | spec | 新規選択は双方の材が必要、材端点touch可、使用後はDesign追従、材復元で自動source復活なし |
| `ARCH-PATTERN-ENDPOINT-DEPENDENCY-DAG` | pattern | source順序に依存しない多段解決、自己参照・間接循環のatomic拒否、同じ参照先sourceの異なるinstanceは利用可能 |
| `SPEC-PATTERN-ENDPOINT-DEPENDENCY-LIFECYCLE` | spec | 多段追従、参照消失とsource削除の連鎖cleanup、split解除で端点存続、依存するsplit材は従来どおり解除、再出現で復活なし |
| `ARCH-PATTERN-ENDPOINT-DEPENDENCY-ATOMICITY` | pattern | 下位だけで発生する退化・Family重複・overlapも全体拒否。要求source消滅を成功にしない |
| `ARCH-PATTERN-INTERSECTION-ENDPOINT-MAPPING` | pattern | mirror / rotationのlogical作用・逆変換・stabilizer、軸変更のmember移行、非対応member喪失、複数階層のFamily統合と材union |
| `SPEC-EDITOR-INTERSECTION-ENDPOINT-INTERACTION` | spec | touch / keyboardで作成と端点変更、split候補との区別、同座標pairのpreviewと明示確定 |
| `SPEC-EDITOR-ENDPOINT-DEPENDENCY-CONFIRMATION` | spec | 端点編集・削除・Symmetry変更の連鎖影響確認、取消し不変、承認時再評価、古い確認の拒否 |

既存 `ARCH-PATTERN-SEGMENT-DISTINCT-ENDPOINTS`、Family / overlap / logical identity、`SPEC-PATTERN-EFFECTIVE-GEOMETRY`、`ARCH-PATTERN-DESIGN-EFFECTIVE-GEOMETRY`、`ARCH-EDITOR-SELECTION-STATE`、端点編集関連の契約は適用範囲と説明を更新する。一般交点とsplit境界を分けたことで旧resolverテストが失敗した場合、維持すべきsplit境界契約は専用APIへ移して残す。単にテストを削除して通さない。

テスト配置の方針:

- domain: APIに直接入力し、結果の論理参照・解決点・source存否・依存状態・拒否時の元Pattern不変を検証する。内部topological順、cache、helper呼出し回数は固定しない。
- interaction: 始点context、候補pairの区別、preview・取消し・stale候補、外部変更による中断をpureな遷移で保証する。
- App統合: 新規交点端点作成、生成instanceの端点変更、連鎖削除確認の代表経路を接続する。domainの組合せ表をUIで重複しない。
- browser: touch emulationで交点へのハンドルdrag、近接候補のInspector切替、取消し、画面スクロールとの競合を確認する。keyboardでも候補を選べることを確認。実機・emulation・jsdomを区別して報告する。

代表ケースには「同座標で異なる2交点を両端に指定する退化」「参照先のstabilizerが解除/成立」「依存先Family統合が下位Family統合を誘発」「連鎖喪失候補と別の生存sourceのoverlapが同時に発生し全体拒否」を含める。正常ケースだけでmigration完了としない。

実装後の必須検証は `npm run test:contracts`、`npm test`、`npm run build`、`git diff --check`。未実行項目を成功扱いしない。

## 6. 実装順・完了条件

1. endpoint型・logical作用・source解決をsplit非依存に整理し、DAG / pair / Geometryのdomainテストを通す。
2. add・端点変更・削除・Symmetry変更の依存継続とatomic検証を実装する。既存split / 材migrationを統合して全domainテストを確認する。
3. endpoint候補queryとEditor / App接続、影響確認、stale対策を実装する。
4. 正本・契約・本書を整理し、必須検証とbrowser確認を行う。
5. 同じブランチをpushし、main向けの実装PRを作成する。既存PRがあれば更新し、`Closes #72` を記載する。mergeはこの作業に含めない。

実装により本書の採用意味論を変更する必要が判明した場合、場当たり的なfallbackを足さず、矛盾する規則・再現例・変更理由を明記して設計と正本を揃える。ファイル分割やprivate helper名は自由だが、依存喪失を拒否へ変える、座標に退避する、暗黙splitを作る等の仕様変更を黙って行わない。

保存・読み込み、Undo / Redo、完成状態validation、自由座標、Generator / Layout、加工出力、汎用フレームワークは対象外。安定IDと論理参照、操作成功時の1回のPattern置換を保つことで、それらの既知の拡張を妨げない。
