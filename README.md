# 組子グリッド

正三角形を基本セルとして、その内部に幾何学的な線分パターンを定義し、正三角形グリッド上に敷き詰めて文様を生成するWebアプリです。

最終的には、レーザーカッターで加工可能なSVGを生成し、組子・幾何学文様・オリジナルパターンの設計に利用することを目指します。

## コンセプト

文様を次の2つの独立した要素として扱います。

- Cell Pattern: 1つの正三角形内部に存在する線分パターン
- Layout: Cell Patternを持つ正三角形を、どの向き・順番で配置するか

この分離により、同じCell Patternを異なるLayoutへ適用できる構成を維持します。

## 開発

Node.js 24を使用します。

```bash
npm ci
npm run dev
```

検証:

```bash
npm test
npm run build
```

## ドキュメント

- [プロダクト仕様](docs/spec.md)
- [アーキテクチャ](docs/architecture.md)
- [開発手順](docs/development.md)
- [Codex向け作業ルール](AGENTS.md)

今後の機能、設計検討、調査、バグ、リファクタリングなどの作業項目はGitHub Issueで管理します。
