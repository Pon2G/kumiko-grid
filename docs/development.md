# 開発手順

この文書は、人間とCodex Cloudがこのリポジトリで開発するときのGit / GitHub運用を定義する。

## 1. 正本の使い分け

- ユーザー向けの現在の仕様: `docs/spec.md`
- 長寿命な技術設計: `docs/architecture.md`
- 開発手順: `docs/development.md`
- Codexが常時守る短いルール: `AGENTS.md`
- 今後の作業項目、設計検討、調査、既知の拡張候補: GitHub Issues

個別作業の進捗、予定、将来機能一覧をMarkdownへ重複して管理しない。

## 2. Issueとラベル

Issueは、今後実施する可能性のある作業や既知の拡張候補を記録する正本とする。

候補を思いついた段階では、タイトルと最低限の背景だけでIssueを作成してよい。具体的に着手するときに、仕様、実装方針、完了条件を必要な粒度まで追記する。

### Issueの状態

- Open: 実装候補、検討対象、または進行中の作業
- Closed / completed: 実装や必要な対応が完了したもの
- Closed / not planned: 現時点では実施しないと判断したもの

一度 `not planned` とした候補でも、方向性が変わった場合はReopenしてよい。

### design-context

現在の設計判断へ影響し得る既知の拡張には `design-context` ラベルを付ける。

このラベルは優先順位や実装予定を意味しない。Open / Closedにかかわらず、関連領域の設計時に背景として参照するための検索インデックスとして使う。

### areaラベル

`area:geometry`、`area:pattern`、`area:layout`、`area:persistence`、`area:generator`、`area:ui`、`area:export`、`area:development` など、影響する領域を表す。

複数領域へ影響するIssueには複数の `area:*` を付けてよい。

## 3. 実装前の設計コンテキスト確認

実装対象のIssueだけを読むのではなく、変更がデータモデル、モジュール境界、Geometry、永続化などへ影響する場合は、関連する `design-context` Issueも確認する。

GitHub CLIを利用できる場合の例:

```bash
gh issue list --state all --label design-context --label area:geometry --limit 100
gh issue list --state all --label design-context --label area:pattern --limit 100
gh issue view <issue-number>
```

複数領域にまたがる変更や基盤的な設計変更では、必要に応じて全件を確認する。

```bash
gh issue list --state all --label design-context --limit 100
```

確認した拡張を今回のスコープへ先回りして実装してはならない。現在の要件を単純に保ちつつ、既知の拡張を不必要に閉ざしていないかを設計判断の材料にする。

## 4. 基本フロー

1. GitHub Issueで作業内容を定義する。
2. 変更領域を特定し、必要な `design-context` Issueを確認する。
3. `main` の最新状態から作業branchを作る。
4. ローカルまたはCodex Cloudで実装する。
5. 必要に応じて仕様・アーキテクチャ文書を同じPRで更新する。
6. `npm test` を実行する。
7. `npm run build` を実行する。
8. Pull Requestを作成する。
9. diff、仕様との整合、既知の拡張への影響、CI結果を確認する。
10. 原則としてsquash mergeする。
11. `main` への反映と必要なデプロイを確認し、Issueをcloseする。

1 Issueに対して1 Pull Requestを基本とする。ただし密接不可分な変更では無理に分割しない。

## 5. branch

作業branchは `main` の最新状態から作る。

branch名は内容を判別できる英語名とする。Issueに対応する場合はIssue番号を含めてよい。

例:

```text
feature/issue-17-svg-export
fix/issue-4-anchor-validation
docs/issue-7-development-workflow
```

`main` へ直接実装を積み上げる運用は避ける。

## 6. 作業開始時の確認

GitHubに関係する作業では、利用可能なCLIやAPIで実際の状態を確認する。

GitHub CLIを使用できる環境では、必要に応じて次を確認する。

```bash
gh auth status
git remote -v
git branch --show-current
gh repo view
gh pr view --json number,title,state,url,headRefName,baseRefName
```

現在のbranchに対応する既存PRがある場合、新しいPRを重複して作成しない。

## 7. Commit

コミットメッセージは日本語で、変更内容が分かる簡潔な文にする。

例:

```text
正三角形のAnchorPointモデルを追加
開発ドキュメントの責務を整理
```

### Codex Cloudのauthor

PR branchは作業履歴として扱うため、Codex Cloudが作成したcommitのauthorがCodexになることを許容する。

人間の作業者を装う目的で、Codexのcommit authorを無理に書き換えない。

`main` はレビューを経て採用された履歴として扱い、原則としてsquash mergeする。squash commitのauthorやco-author情報は、GitHub上で実際に採用された状態をそのまま記録する。

commit authorを統一することより、誰がどの変更を作成し、どの変更がレビューを経て採用されたか追跡できることを優先する。

## 8. Pull Request

Pull Requestは日本語で記述し、最低限次を含める。

- 変更内容
- 変更理由
- 主な実装
- テスト結果
- 既知の拡張への影響
- 未確認事項・制約

「既知の拡張への影響」では、確認した `design-context` Issueがあれば番号と判断を書く。設計上の影響がなければ「なし」と明記する。

Issueに対応するPRでは、本文からIssueを参照する。

既存PRを更新する場合は、そのhead branchへcommitを追加し、新しいPRを作成しない。

GitHub CLIを利用できる場合の例:

```bash
gh pr view
git fetch origin
git push
gh pr edit
gh pr checks
```

PRの作成・更新後は、GitHub上へ実際に反映されたことを確認してから完了として報告する。

## 9. Merge

原則としてsquash mergeを使用する。

目的:

- `main` では1 PRを1つの採用単位として読みやすくする
- PR branch上では実装途中の作業履歴を保持できる
- Codex Cloudと人間の細かなcommit境界を `main` の履歴設計へ持ち込まない

merge前に少なくとも次を確認する。

- レビュー対象のdiff
- `npm test`
- `npm run build`
- CI
- 必要な仕様・設計文書の更新
- 関連する既知の拡張への影響

## 10. Test / Build

テストを追加・変更するときは、次の順に確認する。

1. 検証する振る舞いを自然言語で説明する。
2. `docs/spec.md` または `docs/architecture.md` に維持すべき契約があるか確認する。
3. なければ契約として維持すべきか判断し、必要な場合だけ正本へTest Contract ID付きで記載する。
4. 各test caseを `src/test/contractTest.ts` の `contractTest` で宣言し、正本のIDを指定する。
5. Bug修正では `regression` に元Issue番号を指定する。
6. 契約を壊す最小限の入力と観測可能結果だけを検証する。
7. 規約検証、Unit Test、Buildを実行する。

通常の検証:

```bash
npm run test:contracts
npm test
npm run build
```

Vitestと `npm run test:contracts` は `test-files.json` の対象定義を共有する。テストファイルの配置やsuffixを変更するときはこの定義を更新し、片方の検証だけをすり抜ける対象を作らない。

`npm run test:contracts` はTypeScript ASTを解析し、コメントや文字列を生のtest callと誤認せずに、Test Contract IDとtest caseの対応を検証する。Vitestのnamespace importも、生のtest caseを隠せるためテストファイルでは使用しない。

テストを含むPull Requestでは、機械検証に加えて、assertionが指定した契約を検証していること、契約外の実装詳細を固定していないこと、Regression testが本来の契約を検証していることをレビューする。

依存関係をクリーンに導入する場合:

```bash
npm ci --no-audit --no-fund
```

テストを実行できなかった場合は、成功したように扱わず理由をPR本文や作業報告へ記載する。

## 11. GitHub設定

repository設定を変更する場合は、変更時点のGitHubの仕様と現在のrepository設定を確認する。

運用上の候補:

- Pull Request経由の変更
- CI成功をmerge条件にする
- squash mergeを標準にする
- merge後branchの自動削除
- 必要に応じたRuleset

設定そのものと、この文書に書かれた運用が矛盾しないようにする。

## 12. 認証情報

GitHub token、PAT、Secret等の値を出力、ログ、commit、Pull Request、Issue、コメントへ記載しない。

認証エラー時もtoken値は表示せず、認証状態と権限だけを確認する。
