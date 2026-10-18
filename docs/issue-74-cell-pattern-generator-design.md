# Issue #74: CellPatternGenerator初版の判断記録

設計基準: main `1ee681c967d22888b74b97f9a0e7ee4ea291cf27`（2026-10-18）。親Issue #2、実装scope #74。

## 正本

- [文様生成の仕様・UI契約](spec.md#文様生成)
- [Generator Architecture・v1完全規則・固定ベクトル・API契約](architecture/generator.md)
- [モジュール境界](architecture.md#generator)
- [Patternの検証・状態遷移](architecture/pattern.md)

本書は判断の理由を残す。実装後の規範・Test Contractは上記正本に集約する。

## 採用した判断

- 無制約な端点抽選ではなく、輪郭・放射・風車の3構成を採用。装飾を重ねた設計試作は敷き詰めで密集が目立ったため、最大6本の対称展開と余白を重視する最小構成にした。
- 生成空間の小ささと同じ文様の出現を許容し、美的ランキングや再試行を設けない。事前の試作選定を必須ゲートにしない。
- 文字列からseedへの変換もv1契約に含める。短い整数演算でFNV-1aとxorshift32を実装し、新しい依存や汎用registryを追加しない。
- 候補を読み取り専用で確認してから全置換する。生成と適用を分け、適用前の警告で意図を明確にし、二重確認は設けない。
- source IDが再生成で一致するため、reconcileに任せず旧interactionを明示終了する。native dialogとAppのイベント遮断で旧gestureの継続を防ぐ。
- 生成元recipeと完成Patternを分離し、編集内容をseedから復元できるという誤解を避ける。

## 実装時の確認と調整

生成規則・固定ベクトル・入力変換の設計変更は不要だった。native dialogだけではChromiumでTab巡回がページ外へ移るため、dialog内の先頭・末尾で明示的に巡回する処理を追加した。focus保持という仕様は変えず、プラットフォーム任せにしない実装へ具体化した。

## 既知の拡張への判断

- #2: CellとLayoutを分離し、ID / version / seedを返す。LayoutGeneratorを実装せず親Issueをcloseしない。
- #5 / #16: algorithmVersionと保存schemaを分離。保存機能は追加しない。
- #15: 全置換を一つの適用操作にするがUndo / Redoを先回りしない。
- #17: SVG metadataを追加しない。
- #68: 重なり拒否は既存Pattern APIへ委譲する。
- #72: 生成規則では交点端点を使わないが、適用後の通常編集を妨げない。

## 検証記録

固定ベクトル、入力境界、全48パラメーター組合せ、UI統合をTest Contractで検証する。選別しないsample-000〜023のセル図と4×9敷き詰め、ブラウザ操作の結果・制約は[検証記録](verification/issue-74/README.md)を参照する。
