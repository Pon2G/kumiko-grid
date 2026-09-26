# プロジェクトルール

このリポジトリで作業する際は、README.md をプロジェクト仕様の正本として扱うこと。

## 言語

人間が読む文章は、原則として日本語で記述する。

日本語で記述するもの:

- コードコメント
- JSDoc / TSDoc
- TODO / FIXME コメント
- README、PLAN、その他Markdownドキュメント
- テストケースの説明文（`describe`、`it`、`test` のタイトル）
- Gitコミットメッセージ
- Pull Requestのタイトルと本文
- GitHub Issueのタイトルと本文
- GitHub上で投稿するコメント
- Codexの作業Summary、説明、レビューコメント
- アプリケーション上でユーザーに表示するUI文言

ただし、以下は英語を使用する。

- 変数名
- 関数名
- 型名
- interface名
- class名
- enumおよびenum値
- ファイル名・ディレクトリ名
- npm script名
- API名
- 外部ライブラリ由来の名称
- URL
- SVG / HTML / CSS / JavaScript / TypeScript等の標準仕様上の名称
- JSON等の内部データ形式のキー

既存の技術用語を不自然に日本語化しない。例えば、`AnchorPoint`、`Segment`、`CellPattern`、`LayoutStrategy`はそのまま使用してよい。

## コードコメント

コードコメントは「コードを日本語に翻訳する」ためではなく、コードだけでは分かりにくい意図を説明するために使用する。

コメントを付けるべき箇所:

- 幾何学計算の前提や数式
- 座標系・向き・回転方向などの約束
- 一見不自然だが必要な処理
- 将来変更すると壊れやすい不変条件
- READMEのドメイン仕様とコードの対応関係
- 実装上重要な理由やトレードオフ

コメントを付けなくてよい箇所:

- コードをそのまま読めば明白な処理
- 変数名や関数名を日本語で言い換えただけの説明
- 1行ごとの逐語的な説明

悪い例:

```ts
// xに1を足す
x += 1
```

良い例:

```ts
// 正三角形のローカル座標系では、Aを上頂点として時計回りにB、Cを配置する。
// 下向きセルでもAnchorPoint自体の意味を変えず、配置時の座標変換だけで反転させる。
```

## 公開APIのドキュメント

geometry、pattern、layoutなどのドメインロジックについて、外部モジュールから利用されるexport済みの型・関数には、名前だけでは意図や前提が十分伝わらない場合にJSDocを追加する。

特に以下は説明する。

- 引数がどの座標系か
- 角度の単位
- 回転方向
- 戻り値の意味
- 許容値・不変条件
- n等分点などのインデックス規則

型から明白な内容を重複して書かない。

## 幾何学ロジック

幾何学処理では、座標値だけでなく「なぜその変換になるのか」が重要である。

以下については、必要に応じて日本語コメントを残す。

- 正三角形の基準座標
- 重心計算
- 120° / 240°回転
- mirror軸
- 上向き / 下向きCell間の変換
- Edge Division Pointの座標解決
- LayoutStrategyによるCell配置

Reactコンポーネントには幾何学計算の詳細を持ち込まず、可能な限りpure functionとしてgeometry / pattern / layout層に実装する。

## テスト

テスト名は、失敗したときに仕様が理解できる日本語を書く。

```ts
it('BC辺を5等分した2番目の点を正しい座標へ解決する', () => {
  // ...
})
```

単なる実装詳細ではなく、期待する振る舞いをテストする。

## Git

コミットメッセージは日本語で、変更内容が分かる簡潔な文にする。

例: `正三角形のAnchorPointモデルを追加`

Pull Requestは日本語で記述し、最低限以下を含める。

- 変更内容
- 変更理由
- 主な実装
- テスト結果
- 未確認事項・制約があればその内容

Codexの実行環境などが原因でテストを実行できなかった場合は、成功したように扱わず、その理由を日本語で明記する。

## 実装方針

README.mdに記載されていない機能を、推測だけで大きく追加しない。

仕様上の小さな曖昧さは合理的な仮定を置いて進めてよいが、その仮定が今後の設計に影響する場合はコードコメントまたはPLAN.mdへ記録する。

コードの可読性を優先し、コメントで複雑なコードを正当化するのではなく、まずコード自体を単純にすること。

## GitHub操作

このリポジトリでは、GitHub上の状態確認・Pull Request操作・Issue操作には、原則としてGitHub CLI（`gh`）を使用する。

GitHub上の状態について推測しない。作業開始時および作業完了前に、必要に応じて`gh`で実際の状態を確認する。

### 作業開始時

GitHubに関係する作業では、必要に応じて以下を確認する。

```bash
gh auth status
git remote -v
git branch --show-current
gh repo view
```

現在のbranchに対応するPull Requestが存在する可能性がある場合は、次も確認する。

```bash
gh pr view --json number,title,state,url,headRefName,baseRefName
```

`gh pr view`が成功した場合、そのPull Requestを既存PRとして扱う。

### 既存Pull Requestの更新

現在のbranchに既存PRがある場合、新しいPull Requestを作成しない。

以下の手順を基本とする。

1. `gh pr view`でPR番号、head branch、base branchを確認する
2. 必要に応じて`git fetch origin`でremoteの状態を取得する
3. コードを変更する
4. Test・Buildを実行する
5. 変更をcommitする
6. `git push`で既存PRのhead branchへ反映する
7. 必要に応じて`gh pr edit`でPRタイトル・本文を更新する
8. `gh pr view`で変更がGitHub上に反映されたことを確認する
9. `gh pr checks`でCI状態を確認する

既存PRの更新に`make_pr`や新規PR作成処理を代用しない。

### 新規Pull Requestの作成

現在のbranchに対応するPull Requestが存在しない場合のみ、新規PRを作成してよい。

可能であればGitHub CLIを使用する。

```bash
gh pr create
```

作成後は必ず`gh pr view`でGitHub上にPRが存在することを確認する。

### Pull Requestの編集

PRのタイトル・本文・コメントなどGitHub上の情報を変更するときは、可能な限り`gh`を使用する。

例:

```bash
gh pr edit
gh pr comment
gh pr checks
```

PR本文やタイトルを変更した場合も、操作後に`gh pr view`で実際の反映を確認する。

### Issue

Issueの確認・作成・更新についても、利用可能であれば`gh`を使用する。

例:

```bash
gh issue view
gh issue create
gh issue comment
```

### 完了報告

「GitHubへ反映した」「PRを更新した」「PRを作成した」と報告してよいのは、GitHub上の状態を`gh`で確認できた場合だけとする。

ローカルまたはCodex実行環境内でcommitしただけの場合は、「PRを更新した」と表現しない。

GitHubへのpushやAPI操作に失敗した場合は、成功したように扱わず、以下を確認して報告する。

- どこまで完了したか
- どのコマンドが失敗したか
- 認証・権限・ネットワーク・branch状態のどれが原因と考えられるか

### 認証情報

GitHub token、PAT、Secretなどの値を、出力・ログ・commit・Pull Request・Issue・コメントへ記載してはならない。

認証エラーが発生した場合もtokenそのものを表示せず、`gh auth status`等で状態だけを確認する。
