# Issue #74: CellPatternGenerator初版の実装設計

設計基準: main `1ee681c967d22888b74b97f9a0e7ee4ea291cf27`（2026-10-18）。親Issue #2、実装scope #74。

この文書は未実装の採用設計である。実装時に現在の仕様は `docs/spec.md`、長寿命な技術設計は `docs/architecture.md` から辿る正本へ移す。Test Contract予定IDも、その時点で正本へ登録する。この文書に有効なcontract markerを置いたり、未実装機能を現在の仕様として先に登録したりしない。実装完了後は本書を判断記録と正本へのリンクへ整理し、規範を二重管理しない。

## 1. 目的と初版の境界

文字列から、おまかせでまとまりのある文様を作り、確認して既存Editorへ適用し、そのまま通常編集できる初版を完成させる。ユーザーに細かな生成条件の調整を要求しない。実装前の試作選定を必須ゲートとせず、初版を使った後に次版を検討する。

採用:

- Generator ID `structured-lines`、algorithmVersion `1`。画面上は「おまかせ v1」。
- 3系統の構成と少数の内部パラメーターを、文字列由来のseedで決定する。
- 生成結果にはCellPatternだけでなく、Generator ID・algorithmVersion・seedを返す。
- 独立した生成候補を確認してから、現在の文様全体を置き換える。
- 通常の編集、端点変更、split、材操作を生成後も利用できる。

対象外:

- LayoutGenerator、Layoutの変更、複数版切替UI、生成条件スライダー、ファイル入力、履歴、Undo / Redo。
- JSON保存、SVGへのmetadata埋込み、Seed Code / Pattern Code、共有URL、migration。
- 初版の生成でのIntersectionAnchor端点、split、MaterialExclusion。これらの既存編集機能は維持する。
- 全文様の連結性、加工可能性、セル境界での連続性、美しさの数値保証。
- 伝統文様の再現・名称の保証、汎用plugin registry、候補の美的ランキング。

初版の生成空間は意図的に小さく、異なる文字列から同じ文様が出ることを許容する。無限の多様性は約束しない。伝統的な組子を連想させる規則性と、回転構成の変化を楽しめることを目標にする。

## 2. 現行コードとの接続

確認した境界:

| 現行コード | 設計への反映 |
| --- | --- |
| `src/pattern/cellPattern.ts` | CellPatternはsegments / symmetry / splitRelations / materialExclusions。生成情報を混入しない |
| `src/pattern/patternOperations.ts` の `evaluateAddSegment` | すべてのsourceをこのAPIから追加。拒否を無視して不完全な文様を返さない |
| `src/pattern/anchor.ts` | Vertex / Edge Divisionの論理参照を構築。Pointを永続端点にしない |
| `src/pattern/sourceGeometry.ts` | 既存のSymmetry展開を使用。生成済みinstanceをsourceへコピーしない |
| `src/app/App.tsx` | divisionsはPattern外の編集状態。適用でPatternと一緒に更新する |
| `src/components/CellEditor/editorInteraction.ts` | 文様置換はreconcileだけでは不十分。同じIDが存在してもinteractionを明示的にidleへ戻す |
| `src/components/PatternPreview/PatternPreview.tsx` | 現行Layoutは固定の4行×9列。候補にも同じ表示を使い、配置規則・設定を変更しない |

#2の古い「交点端点は将来機能」という説明に従わない。最新mainでは対応済みだが、本Generator v1の規則には不要なため使用しない。

## 3. 入力からseedへの規則

入力はテキスト1件。画面は複数行入力を許容する。初期値は空、例として「組子」をplaceholderに表示し、自動生成はしない。

1. 入力中のCRLFおよび単独CRをLFへ変換する。
2. Unicode NFCで正規化する。
3. 正規化後が空または `trim()` で空になる場合は拒否する。実際のseed計算ではtrimしない。前後の空白・改行は意味を持つ。
4. 正規化後がUTF-16 code unitで1,024を超える場合、または孤立surrogateを含む場合は拒否する。自動切詰めはしない。入力欄だけでなく生成APIでも検証する。
5. 正規化済み文字列をUTF-8 byte列へ変換する。
6. 32-bit FNV-1aを下記の整数演算で適用し、下位32bitを8桁小文字hex（先頭0を保持）としてseedにする。

```ts
let h = 2166136261
for (const byte of bytes) h = Math.imul(h ^ byte, 16777619) >>> 0
const seed = h.toString(16).padStart(8, '0')
```

暗号・認証・一意識別には使用しない。ハッシュ衝突も、異なるseedから同じ文様になることも許容する。入力正規化・seed導出もalgorithmVersion 1の再現契約に含む。

不正入力は日本語で通知する。例: 「文字を入力してください」「入力は1,024文字以内にしてください」「入力に扱えない文字が含まれています」。長さの厳密な単位は仕様とテストに記載し、UIの字数カウンターは追加しなくてよい。

## 4. seedから文様への完全な規則

### 4.1 整数列と選択順

再生成APIは8桁小文字hexだけを受け付ける。任意の数値・大文字・短縮表現を暗黙に正規化しない。

seedをunsigned 32-bit整数として読み、0の場合だけ内部乱数状態を `0x6d2b79f5` にする。返却metadataのseedは元の `00000000` を保持する。

以下のxorshift32を1回のdrawとし、unsigned整数を返す。float乱数、Math.random、時刻、randomUUID、ブラウザ依存の列挙順は使用しない。

```ts
x ^= x << 13
x ^= x >>> 17
x ^= x << 5
x >>>= 0
return x
```

各生成で必ず4回drawする。`r0, r1, r2, r3` の順とし、次を選ぶ。

| 値 | 決定規則 |
| --- | --- |
| 構成 | `r0 % 3`: 0=輪郭、1=放射、2=風車 |
| n | `[6, 8, 10, 12][r1 % 4]` |
| k | `lo = ceil(n/5)`, `hi = floor(2*n/5)`, `k = lo + r2 % (hi-lo+1)` |
| 向き | `r3 % 2`: 0=正、1=逆。風車だけで使う。他の構成でもdrawは消費する |

moduloによる微小な分布偏りは許容する。統計用途ではないのでrejection samplingを導入しない。乱数消費順はversionの一部であり、実装整理で変えない。

### 4.2 構成

全構成でSymmetryは `{ type: 'rotational' }` とする。ユーザーが後から変更することは妨げない。

表記:

- `E(edge, j)` は `{ kind: 'edge-division', edge, divisions: n, index: j }`。
- `C(j)` は `E(AB,j) → E(CA,n-j)`。頂点A側の2辺を同じ比率で結ぶ。
- `M` は `Vertex A → E(BC,n/2)`。

| 構成 | sourceの追加順 | 展開後の線分数 | 狙い |
| --- | --- | --- | --- |
| 輪郭 | `C(k)`、`C(n/2)` | 6 | 角を切る線と中点三角形で、敷き詰め時の六角形状の余白を作る |
| 放射 | `M`、`C(k)` | 6 | 中央へ集まる線と角の輪郭を組み合わせる |
| 風車 | `Vertex A → E(BC,k)`（正）または `Vertex A → E(BC,n-k)`（逆） | 3 | 傾いた線の回転反復。余分な装飾を足さず密集を抑える |

分母nは約分しない。例えば `2/6` と `4/12` はGeometryが同じでも別の論理Anchorであり、生成時の編集分割数も異なる。座標一致で勝手に統合しない。

構築は、空のCellPattern（rotational、空のsplitRelations / materialExclusions）から開始し、上記の順に `evaluateAddSegment` で追加する。source IDは順に `structured-lines-v1-1`、`structured-lines-v1-2`。IDはPattern内で一意であればよく、別Patternとのglobal uniquenessは要求しない。通常の手動追加では既存のID方針を維持する。

いずれかが拒否されたら、成功扱いで部分Patternを返さず生成全体を失敗させる。候補再試行やfallbackで別の文様に置き換えない。この有限規則では最大2回のsource追加で終了する。返却時のsplitRelationsとmaterialExclusionsは空。

線分数と比率の範囲を規則で制限し、初版では追加の幾何的な美的filterを設けない。source最小長をPattern全体の新しい制約へ昇格させない。

### 4.3 固定ベクトル

次は本設計で独立に計算した値。実装から自動更新するsnapshotにせず、手計算可能なAnchor定義との対応も確認する。

| 入力 | seed | 構成 | n | k | 向き |
| --- | --- | --- | --- | --- | --- |
| `組子` | `81e3f063` | 輪郭 | 6 | 2 | 未使用 |
| `a` | `e40c292c` | 風車 | 10 | 2 | 逆 |
| `é` | `1e9de8c1` | 輪郭 | 10 | 4 | 未使用 |
| `sample-000` | `1729425a` | 輪郭 | 12 | 4 | 未使用 |
| `sample-001` | `182943ed` | 風車 | 6 | 2 | 正 |
| `sample-002` | `15293f34` | 放射 | 8 | 3 | 未使用 |

`e` + U+0301は `é` と同じseed。入力 `a` のsourceはAからBCの8/10へ向かう1本で、rotational展開される。raw seed `00000000` の経路もテストする。上記のベクトルで3構成を網羅する。

## 5. API・生成情報・version

推奨する責務と返却型（命名は意味を維持して調整可）:

```ts
interface CellPatternGenerationRecipe {
  id: 'structured-lines'
  algorithmVersion: 1
  seed: string
}
interface GeneratedCellPattern {
  cellPattern: CellPattern
  generator: CellPatternGenerationRecipe
  editorDefaults: { divisions: number }
}
type GenerationResult =
  | { kind: 'generated'; value: GeneratedCellPattern }
  | { kind: 'rejected'; reason: string }
```

- `generateCellPatternFromText(text)` は入力検証・正規化・seed導出を経てv1を呼ぶ同期API。
- `generateCellPattern(recipe)` はID / version / seedを検証して再生成する同期API。TypeScript型だけを信用せず、少なくとも実行時の未対応ID / version・不正seedを拒否する。
- 現在のPattern、Layout、Editor設定を引数に取らない。入力に対する参照透過性を保つ。
- 成功出力にgenerator情報が必ず存在する。seedのみを返したり、ID / versionをUIの定数としてだけ保持したりしない。
- `editorDefaults.divisions` は編集UIの初期値でありCellPattern schemaではない。v1では全Edge Division Anchorのnと一致する。
- generatorは生成直後の文様の再現条件。手動編集後の全文様を表すコードではない。
- ファイルへの保存・共有の仕様は追加しない。出力オブジェクトにschemaVersionも便宜的に追加しない。

将来v2を追加する際は、v1のdispatchと規則・入力変換・固定ベクトルを維持し、新versionへ明示的に分岐させる。古いversionを黙って最新へ転送しない。初版では小さな明示分岐で十分であり、registryやcapability frameworkを作らない。

公開前の本PR内では、発見した設計不整合を本書と実装で同時に修正できる。v1として公開した後に同じ条件の出力を変える修正はversion変更として扱う。共通Pattern APIの将来変更で出力が変わる場合も固定ベクトルで検知し、旧規則との互換性を明示判断する。現時点でPattern engine全体を複製・凍結しない。

## 6. 画面と状態遷移

### 6.1 操作

Settingsに「文様を生成」ボタンを追加し、生成用dialogを開く。dialog内は次だけとする。

- 入力文字列のtextarea、短い説明、表示名「おまかせ v1」。
- 「生成」ボタン。成功後も入力を変えて生成し直せる。
- 成功時: 読み取り専用のセル図と敷き詰め図。「生成候補・未適用」と明記。
- 成功時: 「この文様に置き換える」、常時「閉じる」。
- 「適用すると現在の文様を置き換えます。元に戻す機能はありません。」と適用前に表示。

初期表示で自動生成しない。入力の変更だけで生成しない。生成候補がない間は適用不可。入力が変わったら以前の候補を失効させ、再度「生成」を押すまで適用不可とする。失敗時も以前の候補を適用できないよう消去する。生成と適用は別操作とし、追加の二重確認dialogは設けない。

dialog内で確認するセル図は読み取り専用。既存CellEditorへ仮Patternを流して編集可能にしない。実線描画には既存のEffective Geometryを使い、セル枠は補助線として区別する。敷き詰めは既存PatternPreviewを再利用し、複数表示になる場合のheading ID / aria-labelledby衝突を避ける（prefix等の局所対応で十分）。

### 6.2 開く・閉じる・競合

- 開いた時点で旧Editorのinteraction、pendingOperation、端点preview、操作通知を終了する。確定Pattern、divisions、生成元情報は変更しない。閉じても古いgesture / selectionは復元しない。
- dialogはmodalとして背景のEditor / Settings操作を遮断する。タッチ・keyboardにも適用する。native dialogを利用してよい。
- Escape / 「閉じる」は未適用候補を破棄し、元の確定Pattern・divisions・生成元情報を維持する。入力文字列はセッション中保持してよい。
- focusをdialog内に保ち、閉じたら起点ボタンへ戻す。スマートフォンではdialog内をスクロールできる。hover必須にしない。
- 開いた時のPattern参照とdivisionsをbaseとして保持する。適用直前にも一致を確認し、不一致なら候補を失効させて「文様が変更されたため、もう一度生成してください」と表示する。失効後は現状態をbaseにして生成し直せる。
- 現状ではmodal＋同期生成で通常競合しないが、古い適用イベントが新状態を書き換えない境界を置く。非同期worker・cancel token・ジョブqueueは不要。

### 6.3 適用

適用の一つのハンドラーで、検証済み生成結果のcellPattern、editorDefaults.divisions、generatorをまとめて確定し、interactionをidle、pendingOperationと各noticeを空にし、dialog候補を破棄して閉じる。renderの途中に不整合な組を見せない。

Appの既存 `patternRef` / `interactionRef` とstateの更新方法を守る。通常のPattern編集経路を大規模にreducerへ移植することは要求しない。domain内へUI stateを持ち込まない。

- 既存PatternへSegmentをappendする操作ではない。旧split・材除外・Symmetryを新Patternへ引き継がない。
- Pattern内IDが再生成前と一致しても、旧selectionや端点編集contextをreconcileで復活させない。遅れたpointerイベントが新しい線を追加しないよう、既存のgesture終了とmodal中の操作遮断を守る。
- 生成による分割数変更は既存Settingsの「線分がある間は分割数変更不可」を迂回する独立した文様置換である。既存PatternのAnchorを新nへ書き換える操作ではない。
- Layout / Previewの行列数・向き・sideは変更しない。現在は固定設定だが、GeneratorにLayoutを引数として渡さない。
- 適用後は通常編集へ戻る。通常編集で生成ロジックを再実行しない。

### 6.4 適用後の生成情報

Appは `CellPatternGenerationRecipe | null` をPatternとは別に保持する。初期手描き状態はnull。成功適用で返却されたrecipeへ更新し、手動編集では変更しない。

表示は「生成元：おまかせ v1」と「生成条件は適用直後の文様を再現します。手動編集は含みません。」という簡潔な説明にする。編集済み判定やPattern全体の比較は不要。seedの常時表示やコピーUIは初版に要求しないが、API出力とApp stateには必ず残す。

入力欄の現在値を生成元として表示しない。適用したrecipeのみが生成元であり、次の候補生成・入力変更・取消し・失敗では上書きしない。generator recipeと独立して通常のPatternだけでも描画・編集できることを保つ。

## 7. モジュール構成

- `src/generator/` に入出力型、入力正規化・seed導出、明示dispatch、v1規則を置く。1責務1ファイルを機械的に強制せず、v1の版境界が読める最小構成にする。
- generator → pattern → geometryの依存方向。pattern / layoutからgeneratorをimportしない。
- `src/components/PatternGenerator/` 等は表示・入力通知と読み取り専用候補表示。乱数・Anchor構築・Pattern validationをReactに置かない。
- `src/app/` は生成dialogの状態、適用、生成元の保持を担当。適用条件の判断は小さなpure helperとして分離してよいが、汎用transaction基盤を追加しない。
- hash / PRNGは本書の短い整数演算を実装し、新しい依存ライブラリを追加しない。

## 8. Test Contractの予定と検証

以下のIDを実装と同時に正本へ登録し、`contractTest` で参照する。ここには有効なmarkerを置かない。

| 予定ID / 正本 | 保証と最小の検証 |
| --- | --- |
| SPEC-GENERATOR-TEXT-INPUT / spec | 空・空白のみ・上限超過・孤立surrogate拒否。NFCと改行の同値性、前後空白を保存。境界長を確認 |
| SPEC-GENERATOR-REPRODUCIBILITY / spec | 文字列経由と返却recipe再入力が同じ論理Pattern・divisionsを返す。同じseedは入力中のEditor状態やLayoutから独立 |
| ARCH-GENERATOR-V1-ALGORITHM / generator詳細 | 固定入力→seed→構成→論理Anchor / symmetry / ID / divisionsのベクトル。0 seed、3構成、風車の両向きを保証 |
| ARCH-GENERATOR-OUTPUT / generator詳細 | 成功出力のrecipeの必須性、未対応ID/version・不正seedの拒否、入力不変、別呼出し結果とmutable配列を共有しない |
| SPEC-GENERATOR-CANDIDATE / spec | 生成しても確定Pattern不変。入力変更・失敗で候補失効。取消し・Escapeで未適用変更が漏れない |
| SPEC-GENERATOR-APPLY / spec | Pattern・divisions・生成元の一括適用、Layout維持、再生成後に同IDでも旧interactionを終了、base不一致の拒否、生成後の編集継続 |
| SPEC-GENERATOR-PROVENANCE / spec | 適用時だけ生成元更新。手動編集・候補生成・取消しで由来を誤更新しない。編集内容まで再現できるという表示をしない |

Generatorの有効性には既存のPattern不変条件の契約も参照する。追加APIの内部呼出し回数をspyで固定せず、全パラメーター組合せの結果で非退化・Family重複なし・overlapなし・正しいsource数・有限な生成を確認する。既存のGeometry判定・Pattern展開を再利用する。

v1の論理出力とsource IDは今回明示的にversion契約とするため、固定ベクトルで比較してよい。private helper名、React state形状、DOM構造、描画用ID、SVG文字列全体、float座標の完全一致は固定しない。乱数中間列そのものを全件assertする必要はない。

UI統合テストはユーザー操作を通し、通常の手描き状態、既存split / 材除外のある状態からの置換、生成後の手動編集を確認する。modalの背景遮断とfocus、touchでの生成・適用・取消しはブラウザでも確認し、jsdomでの確認と区別する。再現性・数値計算をUI経由で重複検証しない。

### 視覚確認

`sample-000` から `sample-023` まで24件を連番で生成し、間引かずセル図と現行4×9の敷き詰めを一覧で確認する。細線だけでなく実際のアプリの線幅でも確認する。補助セル枠と実際の材を混同しない。3構成のうち集合に出なかったものは追加例で補い、元24件は変更しない。

PRには一覧と、まとまり・密集・反復の多様性・同じ文様の出現・セル境界での不連続などの所見を残す。「必ず美しい」「当たり率100%」など根拠のない数値目標を作らない。問題を隠すために良いseedだけへ差し替えない。

本設計段階ではmainのPattern APIへ3構成×8個の(n,k)×2向き=48組を投入し、すべて受理され、最終案の展開後線分が最大6本であることを確認した。これは本実装のテスト実行やブラウザ品質確認の代替ではない。装飾を重ねた候補の敷き詰め確認で密集が目立ったため、上記の最小構成を採用した。

実装完了時に `npm run test:contracts`、`npm test`、`npm run build`、`git diff --check` を実行し、結果・未確認事項をPRへ記載する。

## 9. 既知の拡張への判断

- #2: seed / ID / algorithmVersionを成功出力へ含め、CellとLayoutを分離。親Issue全体はcloseしない。
- #5 / #16: algorithmVersionを保存schemaと混同せず、将来完成Patternと生成元を別々に保存できる境界を維持。今回保存形式は実装しない。
- #15: 文様置換を一つの適用操作にするが、Undo / Redoを先回りしない。
- #17: 生成metadataをSVG出力の仕様として勝手に追加しない。
- #68: Design側の重なり拒否を既存APIへ委譲。Generator専用のoverlap実装を持たない。
- #72: 初版の生成には交点端点を使わないが、生成結果は通常Patternであり適用後の交点端点編集を妨げない。

## 10. 実装の進め方

1. この設計ブランチを継続し、最新mainとの差分と正本を確認する。
2. 生成APIとv1規則、固定ベクトル・不変条件テストを実装する。
3. dialog・候補表示・適用・生成元の保持を接続し、UI契約を検証する。
4. 正本へ仕様・設計・Test Contractを反映し、本書は判断記録へ整理する。
5. 連番入力の視覚確認と規定検証を行い、同じブランチをpushしてmain向けPRを作成する。関連Issueは `Closes #74`、親は `Refs #2`。mergeは行わない。

設計の意味を変える必要が判明した場合は、局所的な例外を積まず、理由と変更箇所を正本・判断記録・PRへ明示する。初版の公開前に必要な整合修正を行うことは許容するが、scopeを勝手に拡大しない。
