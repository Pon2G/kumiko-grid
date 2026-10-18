# Issue #72: IntersectionAnchor端点の判断記録

設計commit `1299633774373e5b4fd62958ffaaec88e6f6f86d` を含む `feature/issue-72-intersection-endpoints` を継続して実装した。設計時のmainは `a6f7d258baa5f95d3658eec2641ba760847e9864`。

現在の規範とTest Contractは次の正本へ移した。

- [プロダクト仕様: 交点端点](spec.md#交点端点)
- [Pattern設計: 交点端点の依存と状態遷移](architecture/pattern.md#交点端点の依存と状態遷移)
- [Architecture overview](architecture.md#3-モジュール境界)

## 採用した判断

未splitのcross/touchをunorderedなconcrete instance pairとして参照する。独立registry、座標コピー、暗黙splitは採用しない。新規選択はEffective Geometry、既存参照の継続はDesign Geometryを基準とする。

#51のsource単位DAGを採用し、依存先から解決する。参照喪失は連鎖削除候補、退化・overlap・循環はatomic拒否とする。完成状態validation、汎用graph framework、Undo / Redo、保存機能は追加しない。

#70 / #71の端点編集・開始Pattern基準preview・安定IDを継続する。#68 / #69のDesign側overlap拒否を依存sourceへ適用する。#30 / #31 / #37のrelative orbit、logical Family、concrete材境界を維持し、#40のpreviewと明示選択を交点端点へ拡張する。#42 / #43の将来機能を今回のscopeへ追加しない。

一般の交点resolverとsplit由来resolverを分け、後者は `deriveSplitIntersectionAnchors` / `resolveSplitIntersectionAnchor` と明示した。低水準key、algebra、source解決を分離しruntime import循環を避ける。これらのファイル名・API名の整理は設計で許容した実装判断であり、採用意味論の変更ではない。

## 検証方針

正本のTest Contractに基づくdomain / interaction / App統合テストと、`npm run test:contracts`、`npm test`、`npm run build`、`git diff --check` を使用する。touch emulationとkeyboardのブラウザ確認は実機確認と区別し、実行結果と未確認事項はPRへ記録する。
