# プロジェクトルール

このリポジトリで作業する際は、必要な内容だけを次の正本から確認する。

- プロダクト仕様: `docs/spec.md`
- 技術設計: `docs/architecture.md`
- Git / GitHub / Codex Cloudの開発手順: `docs/development.md`
- 今後の作業項目・既知の拡張候補: GitHub Issues

## 言語

人間が読む文章は原則として日本語で記述する。

日本語で記述するもの:

- コードコメント、JSDoc / TSDoc、TODO / FIXME
- Markdownドキュメント
- テスト名
- Gitコミットメッセージ
- Pull Request、Issue、GitHubコメント
- Codexの作業Summary、レビューコメント
- アプリケーションのUI文言

変数名、関数名、型名、interface名、class名、ファイル名、ディレクトリ名、API名、内部データのキーなどは英語を使用する。既存の技術用語は不自然に日本語化しない。

## 実装原則

- Cell PatternとLayoutの分離を維持する。
- geometry / pattern / layoutのドメインロジックをReactコンポーネントへ直接持ち込まない。
- 幾何学計算は可能な限りpure functionとして実装する。
- Issueにない将来機能を推測だけで先回りして実装しない。
- コードコメントは処理の逐語説明ではなく、座標系、数式、前提、不変条件、トレードオフなどコードだけでは分かりにくい意図を説明する。
- テストは実装詳細ではなく、仕様として期待する振る舞いを検証する。
- 各test caseは正本に定義したTest Contract IDを `contractTest` で参照する。生の `test()` / `it()` は使用しない。
- Bug修正のRegression testには、維持すべき契約と元Issue番号を記録する。

## 既知の拡張を考慮する

データモデル、モジュール境界、Geometry、永続化など、将来の拡張性へ影響する設計判断を行う場合は、実装前にGitHub Issueの `design-context` ラベルを確認する。

- 変更領域に対応する `area:*` ラベルがある場合は、`design-context` と組み合わせてOpen / Closedを問わず関連Issueを読む。
- 複数領域にまたがる変更や基盤的な設計変更では、必要に応じて `design-context` Issue全体を確認する。
- `design-context` は実装指示ではない。対象Issueの機能を今回のスコープへ勝手に追加しない。
- 現在の要件を不必要に複雑化してまで将来拡張へ備えない。一方、既知の拡張を理由なく困難にする設計も避ける。
- 現在の要件と既知の拡張が衝突する場合は、判断と影響をPull Requestへ明記する。

詳細な検索方法とIssue運用は `docs/development.md` を参照する。

## ドキュメント更新

変更内容に応じて正本を更新する。

- ユーザー向けの現在の振る舞いやデータの意味が変わる: `docs/spec.md`
- モジュール境界、座標系、データモデルなど長寿命な技術設計が変わる: `docs/architecture.md`
- Git / PR / Codex Cloudの作業方法が変わる: `docs/development.md`
- 今後実施する個別作業や既知の拡張候補が増える: GitHub Issue

同じ進捗や将来機能一覧を複数のMarkdownへ重複して記録しない。

## 検証

実装変更後は原則として次を実行する。

```bash
npm run test:contracts
npm test
npm run build
```

実行できなかった場合は成功したように扱わず、その理由を明記する。

## GitHub作業

Pull RequestやIssueを扱う場合は、作業前に `docs/development.md` を確認する。

GitHub上の状態を推測せず、利用可能な手段で実際のbranch、PR、CI状態を確認する。認証情報やSecretの値は出力・commit・Issue・PRへ記載しない。
