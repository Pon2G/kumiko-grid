# Issue #70: Segment端点編集の判断記録

## 開発起点

- 対象: [Issue #70](https://github.com/Pon2G/kumiko-grid/issues/70)
- ブランチ: `feature/issue-70-segment-endpoint-edit`
- 設計確認時のmain: `7ecca53bcc74e1fb26e25464a5470f7d2bbaa83e`
- 設計commit: `4f786e854b8c311043f23788f3ddc1daca80eccf`
- 設計日: 2026-10-12

設計commitを含む同じブランチで実装した。実装の規範部分は以下の正本へ移し、本書には判断の理由と参照先だけを残す。設計時の全文は上記commitから参照できる。

## 現在の正本

| 内容 | 正本 |
| --- | --- |
| ハンドル、Inspector / keyboard、候補preview・明示確定、影響確認、中断 | [spec: Segment端点編集](spec.md#61-segment端点編集) |
| 安定IDとatomicな入力制約 | [spec: Segment端点変更](spec.md#segment端点変更) |
| instanceの逆変換・方向mapping、Editor / Appの責務 | [Architecture: Segment端点編集の境界](architecture.md#segment端点編集の境界) |
| 保存relativeの継続、有向境界の追跡、材の移行・closureと影響計算 | [Pattern Architecture: Segment端点変更](architecture/pattern.md#segment端点変更) |

設計第6章の予定IDは正本のTest Contractとして登録した。domain、interaction、App統合のtestは各契約を `contractTest` から参照する。閾値、private helper、DOM構造を契約にはしない。

## 採用判断

- 長押しを要求せず、明示的なSegment選択から専用ハンドルを直接ドラッグする。共有Anchorを使う他sourceとの操作対象の混同を避ける。Inspectorは近接端点とkeyboardの共通入口になる。
- 端点変更はsource定義の変更であり、Family代表の交換ではない。Geometry一致を前提とするbasis mappingを変形へ流用せず、source ID・端点role・保存relativeを継続の基準にした。
- 自己一致解除時に旧stabilizerの全relativeを増殖させる方式は採らない。保存済みrelationを継続し、失われた有向境界を別に追跡する。relationが残ることと、すべての旧境界が残ることは同じではない。
- 材指定の喪失は旧指定ごとの移行可否で数える。unionの配列件数差を喪失としない。stabilizer closureの拡大は新Design上の移行区間との比較にする。
- previewの基準を編集開始Patternへ固定する。途中の候補で交点が消えても、次の候補評価へ依存削除結果を持ち越さない。成功時の1回のPattern置換を将来のUndo / Redoの記録点にできる。
- Chromiumのtouch emulationでSVGの操作領域だけではdragがスクロールとして中断されることを確認した。実DOMのHTMLハンドルに開始前からtouch-actionを設定し、logical hit解決はscreen-space helperに維持した。DOM順で近接端点を選ばない。

## 既知の拡張との関係

#30 / #31の有向splitとsource-relative材、#37 / #46のcanonicalizationと方向、#40のpreview・明示確定、#68のDesign側overlap制約を維持した。過去Issueの本文より現在の正本を基準にした。

#51のIntersectionAnchor端点、#15のUndo / Redo全体、#5の保存スキーマ、Generator、Layoutは今回の対象に含めない。永続スキーマへrevisionや座標を追加せず、端点変更APIをDOM・pointer・画面座標から独立させた。

操作・継続規則を変更する設計上の矛盾は見つからず、採用意味論を変更していない。
