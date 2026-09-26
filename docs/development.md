# 開発手順

この文書は、人間とCodex Cloudがこのリポジトリで開発するときのGit / GitHub運用を定義する。

## 1. 正本の使い分け

- ユーザー向け仕様: `docs/spec.md`
- 長寿命な技術設計: `docs/architecture.md`
- 開発手順: `docs/development.md`
- Codexが常時守る短いルール: `AGENTS.md`
- 今後の作業項目、設計検討、調査、バグ: GitHub Issues

個別作業の進捗や予定をMarkdownへ重複して管理しない。

## 2. 基本フロー

1. GitHub Issueで作業内容を定義する。
2. `main` の最新状態から作業branchを作る。
3. ローカルまたはCodex Cloudで実装する。
4. 必要に応じて仕様・アーキテクチャ文書を同じPRで更新する。
5. `npm test` を実行する。
6. `npm run build` を実行する。
7. Pull Requestを作成する。
8. diff、仕様との整合、CI結果を確認する。
9. 原則としてsquash mergeする。
10. `main` への反映と必要なデプロイを確認し、Issueをcloseする。

1 Issueに対して1 Pull Requestを基本とする。ただし密接不可分な変更では無理に分割しない。

## 3. branch

作業branchは `main` の最新状態から作る。

branch名は内容を判別できる英語名とする。Issueに対応する場合はIssue番号を含めてよい。

例:

```text
feature/issue-12-svg-export
fix/issue-18-anchor-validation
docs/issue-7-development-workflow
```

`main` へ直接実装を積み上げる運用は避ける。

## 4. 作業開始時の確認

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

## 5. Commit

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

## 6. Pull Request

Pull Requestは日本語で記述し、最低限次を含める。

- 変更内容
- 変更理由
- 主な実装
- テスト結果
- 未確認事項・制約

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

## 7. Merge

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

## 8. Test / Build

通常の検証:

```bash
npm test
npm run build
```

依存関係をクリーンに導入する場合:

```bash
npm ci --no-audit --no-fund
```

テストを実行できなかった場合は、成功したように扱わず理由をPR本文や作業報告へ記載する。

## 9. Issue

Issueは、今後実施する具体的な作業の正本とする。

対象例:

- 新機能
- バグ
- 設計検討
- 調査
- リファクタリング
- ドキュメント変更

仕様として確定した内容は必要に応じて `docs/spec.md` または `docs/architecture.md` へ反映する。Issue本文だけを恒久仕様の正本にはしない。

## 10. GitHub設定

repository設定を変更する場合は、変更時点のGitHubの仕様と現在のrepository設定を確認する。

運用上の候補:

- Pull Request経由の変更
- CI成功をmerge条件にする
- squash mergeを標準にする
- merge後branchの自動削除
- 必要に応じたRuleset

設定そのものと、この文書に書かれた運用が矛盾しないようにする。

## 11. 認証情報

GitHub token、PAT、Secret等の値を出力、ログ、commit、Pull Request、Issue、コメントへ記載しない。

認証エラー時もtoken値は表示せず、認証状態と権限だけを確認する。
