# CellPattern Generator

仕様は[文様生成](../spec.md#文様生成)、Pattern制約は[Pattern Architecture](pattern.md)を参照する。依存方向はgenerator → pattern → geometry。LayoutとCellPatternのモデルへ生成元情報を混入しない。

## 入力からseedへの規則

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

## v1の生成規則

<!-- test-contract: ARCH-GENERATOR-V1-ALGORITHM -->

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

次は設計時に独立に計算した固定値。実装から自動更新するsnapshotにせず、手計算可能なAnchor定義との対応も確認する。

| 入力 | seed | 構成 | n | k | 向き |
| --- | --- | --- | --- | --- | --- |
| `組子` | `81e3f063` | 輪郭 | 6 | 2 | 未使用 |
| `a` | `e40c292c` | 風車 | 10 | 2 | 逆 |
| `é` | `1e9de8c1` | 輪郭 | 10 | 4 | 未使用 |
| `sample-000` | `1729425a` | 輪郭 | 12 | 4 | 未使用 |
| `sample-001` | `182943ed` | 風車 | 6 | 2 | 正 |
| `sample-002` | `15293f34` | 放射 | 8 | 3 | 未使用 |

`e` + U+0301は `é` と同じseed。入力 `a` のsourceはAからBCの8/10へ向かう1本で、rotational展開される。raw seed `00000000` の経路もテストする。上記のベクトルで3構成を網羅する。

## API・生成情報・version

<!-- test-contract: ARCH-GENERATOR-OUTPUT -->

公開APIの返却型:

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

v1として公開した後に同じ条件の出力を変える修正はversion変更として扱う。共通Pattern APIの将来変更で出力が変わる場合も固定ベクトルで検知し、旧規則との互換性を明示判断する。現時点でPattern engine全体を複製・凍結しない。


成功出力は入力recipeを変更せず、別呼出しとmutableな配列・Anchor・metadataを共有しない。

## 責務とUI接続

- `src/generator/` に入出力型、入力正規化・seed導出、明示dispatch、v1規則を置く。1責務1ファイルを機械的に強制せず、v1の版境界が読める最小構成にする。
- generator → pattern → geometryの依存方向。pattern / layoutからgeneratorをimportしない。
- `src/components/PatternGenerator/` 等は表示・入力通知と読み取り専用候補表示。乱数・Anchor構築・Pattern validationをReactに置かない。
- `src/app/` は生成dialogの状態、適用、生成元の保持を担当。適用条件の判断は小さなpure helperとして分離してよいが、汎用transaction基盤を追加しない。
- hash / PRNGは上記の短い整数演算を実装し、新しい依存ライブラリを追加しない。


Appは生成候補と開始時のPattern参照・divisionsを一時sessionに保持する。適用は `evaluateGenerationApply` で現在のPattern参照・divisionsと照合し、成功時だけPattern・divisions・生成元を一つのイベントで更新する。既存のpatternRef / interactionRefも同期更新する。開く時と適用時はinteraction・pendingOperation・noticeを明示的に終了する。native modal dialogで背景を遮断し、Tab / Shift+Tabの両端を明示的に巡回させてfocusを内側に保ち、modal中の遅延interactionイベントもAppで拒否する。CellEditorは既存のinteraction終了に伴うpointer capture解放を利用する。
