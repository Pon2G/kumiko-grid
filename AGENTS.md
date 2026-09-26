# プロジェクトルール

このリポジトリで作業する際は、必要な内容だけを次の正本から確認する。

- プロダクト仕様: `docs/spec.md`
- 技術設計: `docs/architecture.md`
- Git / GitHub / Codex Cloudの開発手順: `docs/development.md`
- 今後の作業項目: GitHub Issues

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
- READMEやIssueに明記されていない機能を推測だけで大きく追加しない。
- コードコメントは処理の逐語説明ではなく、座標系、数式、前提、不変条件、トレードオフなどコードだけでは分かりにくい意図を説明する。
- テストは実装詳細ではなく、仕様として期待する振る舞いを検証する。

## ドキュメント更新

変更内容に応じて正本を更新する。

- ユーザー向けの振る舞いやデータの意味が変わる: `docs/spec.md`
- モジュール境界、座標系、データモデルなど長寿命な技術設計が変わる: `docs/architecture.md`
- Git / PR / Codex Cloudの作業方法が変わる: `docs/development.md`
- 今後実施する個別作業が増える: GitHub Issue

同じ進捗や作業計画を複数のMarkdownへ重複して記録しない。

## 検証

実装変更後は原則として次を実行する。

```bash
npm test
npm run build
```

実行できなかった場合は成功したように扱わず、その理由を明記する。

## GitHub作業

Pull RequestやIssueを扱う場合は、作業前に `docs/development.md` を確認する。

GitHub上の状態を推測せず、利用可能な手段で実際のbranch、PR、CI状態を確認する。認証情報やSecretの値は出力・commit・Issue・PRへ記載しない。
