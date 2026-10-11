# Issue #70: Segment端点編集の設計

## 1. 位置付けと開発起点

- 対象: [Issue #70](https://github.com/Pon2G/kumiko-grid/issues/70)
- 開発ブランチ: `feature/issue-70-segment-endpoint-edit`
- 設計確認時のmain: `7ecca53bcc74e1fb26e25464a5470f7d2bbaa83e`（#69、#68の包含・部分重複拒否を含む）
- 設計日: 2026-10-12
- 状態: 実装前の採用設計。ユーザーの指定により、このブランチに設計を先行して置く。

本書は#70の実装仕様・設計判断・受け入れ条件をまとめる。現在のmainが本書どおりに動くことは意味しない。実装と同じPRで現在仕様の正本 `docs/spec.md`、`docs/architecture.md`、`docs/architecture/pattern.md` を更新する。実装後は本書の規範的な本文を正本への参照と判断記録へ整理し、二重の仕様正本を残さない。

今回は設計文書だけをcommitする。実装はこのブランチ上で続け、PRのbaseはmainとする。mainが進んだ場合は差分を確認して取り込み、採用した操作・意味論を黙って変えない。

## 2. 採用する仕様

### 2.1 操作の基本

1. Canvasまたは既存の曖昧候補選択からSegment instanceを明示的に選択する。
2. 選択したinstanceの両端に、通常のAnchorと形状を区別した端点ハンドルを表示する。
3. ハンドルを直接ドラッグし、移動先Anchorと変更後の形状を確認する。
4. 有効な移動先で離すと1回の端点変更として確定する。依存する編集情報が失われる等の影響がある場合だけ、確定前に確認する。

長押しは要求しない。未選択のSegment、候補preview中のSegment、Fragment・Intersection選択中には端点ハンドルを出さない。Fragmentの分割境界をsource端点としてドラッグする機能は追加しない。材なしSegmentもDesign GeometryのghostからSegmentとして選択し、端点を編集できる。

同じAnchorを共有する他source Segmentの端点は変更しない。同一sourceの対称展開全体は変更する。共有Anchor自体の座標変更や単一の生成instanceだけの変形とは扱わない。

### 2.2 ハンドルと既存タップ操作

- 選択中Segmentのハンドル領域から始まる操作は端点編集の操作として扱い、背後のAnchorによる新規Segment作成へ落とさない。
- 一意なハンドルを押して、移動距離の閾値未満で離した場合はSegment選択を維持する。Patternを変更せず、新規Segment作成も開始しない。
- 閾値を越えた後に開始位置へ戻って離した場合も、通常タップに変換しない。
- ハンドル以外の場所では既存のCanvas選択・AnchorによるSegment作成を維持する。
- ハンドルと重なるAnchorから新しいSegmentを作る場合は、背景タップ・Escape・Inspectorの「選択解除」でSegment選択を解除してから操作する。
- ハンドルは十分なscreen-spaceの操作領域を持ち、表示サイズとhit領域を区別してよい。shape・輪郭・選択表示を用い、色だけで区別しない。

両端のhit領域が重なる短いSegmentでは、pointerdownから一意に端点を決められなければドラッグを開始しない。近さ・DOM順・sourceのstart優先で決めず、Inspectorの端点指定を案内する。選択状態は維持する。

ハンドルの優先によって、短いFragmentや近接Intersection等の操作領域全体が覆われる場合も、操作不能にしない。既存hit resolverの「直接操作可能な領域が残るか」の考え方を利用し、その場合に限りInspectorへ「端点付近の対象を選択」を提示する。そこから覆われた論理対象を既存の候補preview・明示確定へ渡す。通常操作の一覧化やFragmentごとの常設操作ボタンにはしない。Anchorからの新規作成については前述の選択解除を使う。

### 2.3 ドラッグ以外の端点編集

Segment Inspectorに「始点を変更」「終点を変更」を置く。選択instanceの描画方向に対応する端点を指し、選ぶとCanvasでその端点を強調し、「移動先の点を選択」状態へ進む。この入口はハンドルが近接する場合、マウス・キーボード操作、ドラッグが難しい場合に共通で使う。

- 移動先Anchorのタップ、またはfocusしたAnchorのEnter / Spaceで指定できる。
- 一意ならドラッグを離した場合と同じ検証・確定へ進む。
- 曖昧なら候補preview・明示確定へ進む。
- この状態でAnchorを指定しても新規Segmentを作らない。
- Anchor以外のオブジェクトhitは変更先として受け付けない。背景・Escape・「取消し」は端点編集を取り消す。
- ハンドル自体もfocus可能とし、Enter / Spaceで同じ移動先選択へ進めてよい。キーボード用に重なる通常Anchorを二重の操作対象として残さない。

取消しでは、編集前の選択instanceが現在も存在する限りSegment選択へ戻る。通常の候補選択におけるclearは引き続きidleへ戻る。両者は異なる操作contextであり、既存の候補取消し仕様を全体的に変更しない。

### 2.4 移動先と曖昧性

移動先は現在のEditorのdivision設定から得るVertex / Edge Division Anchorとする。自由座標・IntersectionAnchorは対象外。空間座標を永続化せず、Anchor参照を変更する。

pointer位置からscreen-spaceのsnap領域に入るAnchorを求める。通常のAnchor hitと同じ座標変換・操作領域の考え方を使う。移動先の解決ではSegment / Fragment / Intersectionを候補に混ぜない。

| 候補 | ドラッグ中 | 離した後 |
| --- | --- | --- |
| 0件 | 未確定のrubber-bandと移動先未指定を示す | 変更を取り消し、Segment選択へ戻る |
| 1件・変更可能 | snap先と変更後Patternをpreview | 影響確認が不要なら確定 |
| 1件・変更不可 | 禁止表示と短い理由。無効Patternは派生計算へ渡さない | 元のPatternを維持し、理由を通知 |
| 複数件 | 候補点を示し、1件を勝手に確定しない | 端点編集contextを保ってInspectorで選択 |

複数件では近いもの・変更可能なものだけへ自動で絞らない。無効候補も理由を示せるようにする。同じ座標の異なるAnchor identityは勝手に統合しない。pointerを移動して一意になるなら、その候補をpreviewする。snap領域外で無制限に最寄りAnchorへ吸着させない。

離した後の候補行タップはpreviewだけとし、「選択」で移動先を決める。候補が1件へ減った場合にも未選択候補を自動確定しない。既存の候補UIを利用できるが、確定後のcommandは端点変更であり、新規作成のstartAnchor contextと混同しない。

元のAnchorを指定した場合はno-opとしてSegment選択へ戻り、エラーや影響確認を出さない。反対側端点と同じlogical Anchorへの変更は拒否する。

### 2.5 previewと確定

previewの毎回の入力は編集開始時の同じPatternと変更先Anchorである。前回previewのPatternへ次の変更を積み重ねない。

有効候補ではsource family全体と依存情報を更新した最終候補を表示する。Cell Editorでは元の選択instanceを薄く残し、操作中の線分・移動先を強調する。Pattern Previewにも候補のEffective Geometryを一時表示し、「端点変更プレビュー」と示す。これらは表示用の候補であり、Appの確定Patternは変更しない。

無効候補や移動先なしでは確定Patternをそのまま表示し、Editorの補助線だけで指の位置・無効性を示す。自由座標の補助線をSegmentとしてPattern APIへ投入しない。

候補が切り替わるたびに依存削除を含む評価を最初から行うため、一時的に交点を失った候補を通過しても、元へ戻れば依存情報は維持される。pointerの各pixel移動ではなく、候補Anchorや基準Patternが変わった時点で必要なdomain評価を行う。

通常の有効な変更はpointerupまたは移動先明示選択で1回だけ確定する。pointerup時にも現在位置の候補を解決し、最後のpointermoveの古い候補をそのまま採用しない。

### 2.6 影響確認

次のいずれかが発生する場合に限り、候補を表示したままInspectorに影響と「変更する」「取消し」を提示する。

- 既存SplitRelationを引き継げない、または既存の有向concrete split境界を引き継げない。
- 既存MaterialExclusionの境界を引き継げず、その指定が解除される。
- 自己対称性の変化に伴うstabilizer closureによって、写した材なし区間を超える区間も材なしになる。

通常の端点移動に伴う交点座標・区間長の変化、境界順序の入れ替わり、意味を保ったcanonicalization / unionだけでは確認を出さない。確認は「分割が一部解除されます」「材なし区間N件が解除されます」「対称性を保つため材なし区間が広がります」等の利用者向けの短い説明とする。内部transformやrelation keyを判断材料にしない。

分割の有向境界消失を無向IntersectionAnchorの存在だけで判定しない。逆向きのrelationが残っても、target側の分割は失われ得る。件数は単純な配列長の差から求めない。unionで2区間が1区間へ正規化されても、維持された指定を「1件解除」と報告しない。

「取消し」は確定Patternを変更しない。「変更する」は現在の基準が一致することを確認して、同じPattern層の操作を再評価・確定する。確認中のCanvas入力は背景も含めて無視し、通常のCanvas作成・選択を発火させない。取消しボタンまたはEscapeで編集を終了できる。

### 2.7 中断と競合

- Escape、pointercancel、確定前の予期しないcapture喪失、window blur、非表示化、複数pointerによる中断は未確定編集を取り消す。
- 正常なpointerup後のcapture解放通知で確定を再実行したり、確定済み変更を巻き戻したりしない。
- 編集中・候補選択中・影響確認中に確定Patternまたはdivision設定が変わったら、その編集を失効させる。古い候補を新しいPatternへ自動適用しない。
- 外部の変更自体は巻き戻さない。選択維持は現在の論理identityで照合し、消滅していればidleへ戻す。
- pointer captureや選択抑止はハンドルから始まった操作に限定する。ハンドル以外からのページスクロールを奪わない。ハンドルはpointerdown前からtouch-actionを設定できる実DOM領域を持たせる。
- touch / mouse / penをPointer Eventsで扱い、primary buttonだけを受け付ける。二重のmouse/touch処理系を作らない。
- dragに属するpointerup / clickが通常のCanvas hitやAnchor作成として再処理されないよう、gesture単位で消費する。次の独立したタップまで無条件に無視する方式にしない。

開始閾値、snap半径、線幅等の具体値は調整可能な実装パラメータであり、長押し時間や画素数そのものをTest Contractにしない。

## 3. Pattern domainの設計

### 3.1 更新の単位とAPI

操作の意味は「指定source SegmentIdのstartまたはendを、指定SegmentEndpointAnchorへ変更する」である。SegmentId、反対側端点、他source定義、Symmetryは維持する。sourceのstart / endを並べ直したり、代表sourceを選び直したりしない。

Pattern層に、この変更をatomicに評価するpureな公開操作を追加する。返却結果は少なくとも `unchanged`、`rejected`（理由）、`changed`（新Patternと影響）を区別する。名称・具体型は実装時に決めてよい。既存のaddSegment / changeSymmetryまで新しい結果型へ一括変更しない。

previewと確定はこの同じ操作を利用する。UIは返却された候補Patternを永続配列単位で組み替えず、確定時だけ完成したPattern全体を採用する。低水準のsetterや、任意の候補Patternを検証なしで適用する公開APIを増やさない。

拒否・no-opでは入力Patternと依存情報を変更しない。存在しないsource、無効なendpoint selector、現在許可していないAnchor種別等をtyped APIの通常入力として扱わない。境界で受け得る不正要求は安全に拒否する。汎用import validatorや既存malformed Patternの修復は対象外。

### 3.2 concrete instanceからの入力

選択しているcanonical instanceのtransformをg、表示上の移動先Anchorをaとすると、source端点へ設定する値は `applyToAnchor(inverse(g), a)` で得る。

- 現在のRenderedSegmentのstart / endはsourceの順序を保ってtransformされているため、ハンドルはそのsource endpoint roleを明示的に持つ。左右上下や距離からroleを推測しない。
- 逆変換・Anchorへの作用は既存symmetry algebraを利用する。Reactやendpoint更新処理へmirror軸・rotation stepsのcase表を追加しない。
- 指定instanceが現Patternに存在し、開始時に選択したinstance・端点であることを確認する。候補previewから編集対象を決めない。
- 更新後に選択instanceが自己一致へ収束した場合は、同じsourceとraw transformを新定義でcanonicalizeし、その明示的mapping先を選択する。Geometryが近いinstanceの検索で代用しない。
- ハンドルのroleを写す際はraw→canonical mappingのdirectionを使う。basis mappingのdirectionと混同しない。source定義自体のstart / endは交換しない。

通常の外部Pattern変更に対する既存reconcileを、消えた選択を自動canonicalizeして別対象へ付け替える仕様に変えない。今回の端点編集成功時だけ、操作結果に基づく明示的な選択移行を行う。

### 3.3 入力制約

次の順に候補定義を検証し、拒否時は依存情報の変更結果を返さない。

1. sourceの存在と変更対象端点を確認する。同じlogical Anchorへの要求はno-op。
2. start / endのlogical Anchor identityが同一になる変更を拒否する。
3. 編集対象を除いた他sourceとのFamily重複を拒否する。Family統合、他source削除、ID入れ替えによる救済は行わない。
4. 候補sourceのcanonical instance同士、および候補instanceと他sourceの全instanceとの有限長overlapを拒否する。
5. 制約を満たした場合だけ、次節の依存情報更新へ進む。

overlapには#68と同じexpandPattern / intersectSegmentsを利用し、Design側の線分全体を比較する。編集前の自分自身のinstanceを比較対象へ残さない。stabilizerによる論理的自己一致をcanonicalizeした後に比較する。材なし状態を理由に重なりを許可しない。

端点接触・通常の点交差・離れた同一直線上区間・重複しない辺上Segmentは許可する。退化判定を新たなepsilon・最小長・Anchor分数の約分へ拡張しない。現EditorはSegmentがある間division設定を固定しているため、通常の操作候補は同じdivision設定に属する。この前提を緩める機能や異なるAnchor identityが同座標へ解決される退化入力の一般対策は本Issueへ混ぜない。

### 3.4 SplitRelationの継続規則

端点変更はsourceの定義変更であり、Family代表の交換とは異なる。旧定義と新定義のGeometry一致を要求するbasis mappingを、変形のmappingとして使わない。

既存の各SplitRelationについて、source IDと保存済みのrelativeTransformを継続の基準とする。同じSymmetry上で、target identity instanceとそのrelativeTransformに対応するcutter instanceを新定義へ解決し、新しいcanonical relationへ正規化する。そのorbit全体を新しいDesign Geometryで検証し、有効なら保持し、無効なら削除する。重複するcanonical relationは1件へ正規化する。

この規則は編集対象がtargetでもcutterでも同じである。他sourceをtargetとするrelationも必要に応じて変わる。Effective Geometry上の新規候補を再取得してrelationを作り直さない。材なしになった交点でもDesign Geometryとして有効な既存relationは維持する。新しく交差した相手とのsplitを自動追加しない。

自己対称性が変わる場合も、旧relationの保存済みrelativeTransformを1つの継続要求として扱う。旧stabilizerのため同値だった全raw relativeTransformを列挙して、複数の新relationへ増殖させない。逆に自己一致で同値になるrelationはcanonicalizeする。この継続規則は明示的に採用する仕様であり、移動前と後でconcreteな分割境界の集合が完全に一致するとは限らない。

例えばmirrorでtargetが自己一致し、identityとmirrorのrelativeが同一orbitだった場合、保存済みcanonical relativeがidentityなら、自己一致が解けた後もidentity orbitを継続する。以前target identity上にあったmirror cutterの境界は、継続後のそのtarget上に存在しなければ失われる。別relativeのsplitを補って保存しない。失われる境界と依存する材なし指定は影響確認の対象になる。

1つのorbitの一部だけを残す部分relationは作らない。移動によって分割が解除された後に元のAnchorへ戻しても、解除済みrelationを自動復活させない。未確定previewから元へ戻す場合は、編集開始Patternからの再評価なので失われない。

### 3.5 MaterialExclusionの継続規則

1. source IDとsourceのstart / end roleを維持する。endpoint boundaryは同じroleへ追従し、元の絶対座標や長さ・割合へ固定しない。
2. split-boundaryは、旧source identity targetと保存されたcutter transformを同じsource ID・同じSymmetryの新定義へ写し、既存のconcrete boundary正規化を利用する。
3. 移行後の対応する有向relationと具体的境界が存在する場合だけ境界を保持する。relation keyの存在や無向Anchorの存在だけで通さない。
4. 両境界を保持でき、既存の区間規則で有効なMaterialExclusionを新Design Geometry上で正規化する。変更後のtarget stabilizerに対しても区間集合を閉じる。
5. 解決不能な境界に依存するexclusionは丸ごと解除する。近い交点への付け替え、残る側だけへの切詰め、パラメータ比による代替は行わない。

境界の前後関係が逆転しても、同じ論理境界pairの間として解釈する。座標が一致した異なる論理境界を統合しない。ゼロ長LogicalFragmentの扱いは既存規則を維持し、Geometryとしての長さゼロを理由に論理identityを新しく削除する処理を追加しない。両境界が同じlogical boundaryへ収束し有効区間でなくなった場合は解除する。

全体材なしのstart-end指定も端点移動に追従する。既存の区間unionとstabilizer closureを利用し、解除される旧指定の追跡と、union後の配列長を区別する。closureにより写した有効区間のunionを超えて材なしになる場合は、2.6の確認対象とする。通常の変形で同じ区間の長さが変わるだけなら確認不要。

他sourceの材なし区間でも、編集Segmentをcutterとして境界参照していれば同じ移行・確認の対象になる。依存解除した指定のhidden履歴は保存せず、後から同じ交点が現れても復活させない。

### 3.6 影響の計算

影響はPattern層の候補構築と同時に導出し、UIで分割・材の意味を再実装しない。

- 各旧relationから継続先relationを追跡し、存在・orbit validityを確認する。canonical keyの変化だけを削除と数えない。
- 各旧有向concrete pairのsource ID・保存されていたcanonical transformを新定義でcanonicalizeし、継続先relationのorbitにその有向pairがあるか照合する。ない境界は失われる。これは喪失検出であり、旧pair群から新relationを追加するアルゴリズムには使わない。
- 新しいstabilizerにより複数pairが同一の有効境界へ写るだけなら、対応は保たれている。新定義で交点が移動したこと自体は喪失ではない。
- 各旧exclusionが有効な境界pairへ移行できたかを追跡する。正規化で吸収されても解除と数えない。
- 材なしの拡大は、新Design Geometry上で移行した有効区間のunionと、そのstabilizer closureとの差で判定する。旧座標の線分差分では判定しない。既存の区間演算責務を利用し、UIに別の区間演算を作らない。

候補は常に有効なCellPatternとして返す。segmentsだけを変更して旧依存配列を残した不整合なPatternを、UIや一般のGeometry導出APIへ公開しない。検証用には必要なsegments / symmetryの狭い入力を使い、relation再構成→boundary移行→材正規化の順で完成させる。

## 4. EditorとAppの責務

既存の排他的EditorInteractionを拡張する。独立したisDragging、selectedEndpoint、pendingConfirmation等の組合せで矛盾状態を作らない。

概念上、次の状態を区別する。型名と分割方法は実装の自由とする。

| 状態 | 必要なcontext | 終了先 |
| --- | --- | --- |
| Segment選択 | concrete instance | 既存選択操作、端点操作 |
| ハンドル押下中 | instance、source endpoint、pointer、開始位置、開始Patternの識別 | 閾値未満なら選択維持、越えたらdrag |
| 端点drag中 | 同じ編集context、pointer位置・移動先候補 | 取消し、候補選択、影響確認、確定 |
| 移動先指定中 | 同じ編集context、Anchor候補とpreview identity | 取消し、影響確認、確定 |
| 影響確認中 | 同じ編集context、変更要求、影響 | 取消し、再評価して確定 |

移動先指定中の単一Anchor入力と曖昧候補選択は同じ端点編集contextに属する。通常のchoosing-targetと部品を共有してよいが、通常作成のstartAnchor、候補preview中の対象、編集対象を取り違えない。

CellEditorはDOM座標・pointer capture等を扱う薄いadapterと表示を担当する。screen-space hit判定はpure helperに置き、意味のあるinteraction遷移はeditorInteraction側に置く。Pattern APIの評価・確定とstate所有はAppが担当する。pureなinteraction遷移へUUID生成、React setter、DOM、Patternの配列変更を持ち込まない。

開始Patternの識別はAppのimmutableなPattern参照、または一時revisionで行えばよい。永続スキーマにrevisionを追加しない。編集中はlive Patternの複製を独立した第二の正本として保持しない。必要な基準への参照・候補・派生表示は一時情報として扱い、previewごとにreferenceが変わることを「外部Pattern変更」と誤判定しない。

UIからの確定要求はsource endpointと移動先Anchor、および編集contextの検証に必要な情報を持つ。任意のnextPatternをevent payloadとして送り込み、検証を迂回できる境界にしない。Appは開始基準の一致を確認してPattern操作を評価し、成功した完成Patternを一度だけ採用する。

将来のUndo / Redoでは、この成功時の1回のPattern置換を1操作として記録できるようにする。本IssueでUndo / Redoや汎用transaction / gesture frameworkは導入しない。

## 5. 現在の正本から変更する箇所

| 現在の仕様・実装 | #70での変更 |
| --- | --- |
| 選択状態によらずAnchorを作成対象として優先 | 明示的なSegment選択時の端点ハンドル、端点編集contextだけを例外にする |
| Canvasのpointerupで通常hitを実行 | ハンドル操作の所有をpointerdownから追跡し、通常hitへの漏れを防ぐ |
| Segment Inspectorは主に削除操作 | 始点・終点変更、選択解除を追加。必要時だけ覆われた対象への入口を追加 |
| Segmentの追加・削除、Symmetry変更が主な定義更新 | 安定IDを維持したatomicな端点変更を追加 |
| overlap検証は追加・Symmetry変更 | 端点変更にも同じDesign側の制約を適用 |
| clearは既存候補contextを捨てidle | 既存仕様を維持しつつ、端点編集の取消しは元のSegment選択へ戻す別遷移を追加 |

通常の曖昧候補preview、splitの有向性、材のsource-relative表現、Family追加拒否、Symmetry変更時のFamily統合、Layoutとの分離は維持する。端点編集のためだけに既存操作全体を新しいcommand frameworkへ統一しない。

主な実装入口は `src/components/CellEditor/CellEditor.tsx`、`editorInteraction.ts`、`canvasHitResolver.ts`、`src/app/App.tsx`、`src/pattern/patternOperations.ts`。domain primitiveは `symmetry.ts`、`segmentFamily.ts`、`designGeometry.ts`、`materialExclusion.ts` の既存責務から利用する。必要な小さい責務分割は許可するが、具体ファイル配置そのものを契約にしない。

## 6. Test Contractと受け入れ条件

以下は実装時に正本へ置く新規契約の予定IDである。この設計先行commitには検証器が収集するmarkerを置かず、未実装契約を現在のmainの保証として登録しない。実装時に既存契約と重複する部分は既存IDへ統合してよいが、各観測可能な保証を欠落させない。

| 予定ID | 正本 | 維持する保証 |
| --- | --- | --- |
| SPEC-EDITOR-ENDPOINT-HANDLES | spec | Segment明示選択時だけハンドルを操作でき、短いタップは作成を開始しない。共有Anchorでも対象sourceが限定される |
| SPEC-EDITOR-ENDPOINT-DESTINATION | spec | 有効Anchorへの移動、曖昧候補のpreview・明示確定、ドラッグ以外の入力が同じ編集になる |
| SPEC-EDITOR-ENDPOINT-TRANSACTION | spec | previewは未確定、成功時1回更新、取消し・中断・競合で未確定変更を採用しない |
| SPEC-EDITOR-ENDPOINT-IMPACT | spec | 分割境界・材指定の喪失、stabilizerによる材なし拡大を確定前に説明し、取消し可能にする |
| SPEC-PATTERN-ENDPOINT-UPDATE | spec | source IDと反対側端点を維持し、Family重複・同一端点・overlapをatomicに拒否する |
| ARCH-PATTERN-ENDPOINT-CONTINUATION | pattern | 保存済みrelativeTransformを継続し、Designでorbit再検証、concrete boundary移行、材正規化を行う |
| ARCH-EDITOR-ENDPOINT-INSTANCE-MAPPING | architecture | 選択instanceのAnchor逆変換と、更新後のcanonical ref・端点方向への明示的mappingを行う |

### 6.1 Patternの観測可能なケース

- noneで片端だけを変更でき、source ID・反対側端点・他source定義を維持する。同じAnchorへの変更はno-op。
- 同一端点、他Familyへの一致、包含の両方向、部分重複、自己Symmetry instance間のoverlapを拒否する。有効なSplitRelation / MaterialExclusionを含む入力が拒否後も変わらない。
- 編集前の自分自身と重なる変更は、それだけを理由に拒否しない。端点接触・点交差・辺上の正常例を許可する。
- mirror・rotationalの生成instanceから指定した移動先が、sourceの正しい端点へ逆変換され、反対側の表示端点を維持する。
- 自己一致の発生・解除を扱う。端点を交換するmirror自己一致で、canonical refと方向を混同しない。
- target編集とcutter編集の両方で、既存のsplitが移動しても有効なら残り、無効ならorbit全体が消える。新規交点にsplitを自動追加しない。
- 保存relativeの継続を検証する。自己一致の解除で旧orbitを複数relationへ増殖させず、同じrelationが残っても失われた有向境界を影響として検出する。逆向きrelationが残る例も含める。
- split-boundaryのcanonical cutterが変わっても明示的に移せる指定は維持する。境界を失う指定は解除し、別の同座標交点へ付け替えない。
- start-end全体材なし、動く交点と端点の間の材なし、他sourceが編集sourceをcutterとして参照する材なしを検証する。
- 境界順序の逆転、unionでの配列件数減少、自己対称性獲得時のstabilizer closureを区別し、影響判定が正しい。
- 確定後に元の端点へ戻しても解除済み情報は復活しない。一方、preview経由で戻しただけなら入力情報を失わない。

### 6.2 Editor / Appの統合ケース

- 通常タップによる作成・選択、既存候補preview・取消しを維持する。選択した端点ハンドルの短いタップだけは新規作成へ進まない。
- 一意ハンドルのドラッグ、近接ハンドルのInspector経由、keyboard経由が同じ結果になる。
- 複数の移動先候補はpreviewだけで確定せず、既存の新規作成commandも出さない。無効候補を勝手に飛ばして別候補へ変更しない。
- pointerupで現在位置を評価する。drag終了のpointerup / clickを二重処理せず、その後の独立した通常タップは受け付ける。
- preview中は確定Pattern不変。無効候補を経て有効候補へ戻す・取消す場合も依存情報を失わない。
- 影響確認の承認時だけ更新する。取消し・pointercancel・中断・外部Pattern変更・古い確認要求では古い候補を採用しない。
- ghostから全体材なしSegmentを編集できる。ハンドルに覆われた短いFragment等も候補preview経由で到達できる。
- 編集成功後の選択は明示的mapping先へ維持する。外部更新で消えた別の選択をGeometry一致で復活させない。

各caseは `contractTest` で正本の契約を参照する。DOM構造、CSSクラス、閾値の具体値、private helper名の固定は避ける。新機能の全ケースを機械的にregression指定せず、既存不具合の回帰を追加する場合に該当Issue番号を記録する。

### 6.3 手動確認と完了条件

- スマートフォン相当のviewportとtouch入力で、指による遮蔽、候補の視認性、ハンドル開始のdrag、ハンドル外のページスクロール、近接端点、Canvas外への移動・中断を確認する。
- desktopのmouseとkeyboardで端点指定・取消し・影響確認を確認する。
- 実機未確認の場合、emulation / jsdomの確認と区別してPRへ記載する。jsdomだけでtouch-actionやcaptureの実ブラウザ動作を保証したと報告しない。
- `npm run test:contracts`、`npm test`、`npm run build`、`git diff --check` を実行する。
- 実装と正本・契約を同じPRで整合させ、未確定事項を実装都合の暗黙仕様にしない。

## 7. 関連設計と非目標

#30 / #31の有向split orbitとsource-relative MaterialExclusion、#37 / #46のinstance canonicalizationと方向情報、#40の候補preview、#68の重複拒否を維持・利用する。過去Issue本文が現行正本と異なる場合は現行正本を基準に、本書が指定する変更だけを適用する。

#51のIntersectionAnchor端点、依存DAG、自由座標Anchor、複数sourceの一括移動、単一生成instanceだけの変形、#15のUndo / Redo全体、保存スキーマ更新、Layout編集、汎用validation / transaction / gesture frameworkは実装しない。

今回のdomain更新APIをpointer eventや画面座標に依存させず、将来の別UIやGeneratorからも同じ制約を利用できる境界とする。将来機能のためだけに現在の入力型をAnchorRef全体へ広げない。
