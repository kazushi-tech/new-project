# Backend MVP - SpecForge Requirements Review

## 概要

要件定義ドラフトをルールベースで自動レビューし、構造化されたfindingsとMarkdownレポートを出力するバックエンドMVP。

## ローカル起動手順

### 1. 依存インストール

```bash
npm install
```

### 2. 環境変数設定

`.env.example` を `.env` にコピーし、値を設定:

```bash
cp .env.example .env
```

```env
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_OWNER=kazushi-tech
GITHUB_REPO=new-project
PORT=3000
NODE_ENV=development
```

### 3. ビルド

```bash
npm run build
```

### 4. 開発サーバ起動

```bash
npm run dev
```

## .env 必須項目

| 変数 | 必須 | 説明 |
|------|------|------|
| `GITHUB_TOKEN` | PR連携時のみ | GitHub Personal Access Token（repo, write:discussion） |
| `GITHUB_OWNER` | PR連携時のみ | リポジトリオーナー |
| `GITHUB_REPO` | PR連携時のみ | リポジトリ名 |
| `PORT` | No | サーバポート（デフォルト: 3000） |
| `NODE_ENV` | No | 実行環境（デフォルト: development） |

## API エンドポイント

### GET /health

稼働確認。

```bash
curl http://localhost:3000/health
```

レスポンス:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-02-07T10:00:00.000Z"
}
```

### POST /api/review/run

要件レビュー実行。

#### ファイル指定（ローカル）

```bash
curl -X POST http://localhost:3000/api/review/run \
  -H 'Content-Type: application/json' \
  -d '{"source":"file","filePath":"requirements/requirements-draft.md","dryRun":true}'
```

#### PR指定（GitHub連携）

```bash
curl -X POST http://localhost:3000/api/review/run \
  -H 'Content-Type: application/json' \
  -d '{"source":"pr","prNumber":1,"dryRun":false}'
```

レスポンス:
```json
{
  "reviewId": "rev-20260207143000",
  "summary": {
    "totalFindings": 5,
    "bySeverity": { "critical": 0, "high": 3, "medium": 2, "low": 0 },
    "qualityScore": 4.5
  },
  "findings": [
    {
      "id": "FIND-001",
      "rule": "missing-acceptance",
      "severity": "high",
      "category": "testability",
      "target": "NFR-001",
      "message": "NFR-001「パフォーマンス」に受入条件が定義されていません",
      "suggestion": "[AI提案] テスト可能な受入条件を追加してください",
      "line": 66
    }
  ]
}
```

### POST /api/webhooks/github

GitHub Webhook受信。`X-GitHub-Event: pull_request` ヘッダ必須。

```bash
curl -X POST http://localhost:3000/api/webhooks/github \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: pull_request' \
  -d '{"action":"opened","pull_request":{"number":1,"head":{"sha":"abc1234"}}}'
```

## CLIコマンド

### ローカルレビュー

```bash
npm run review:local -- --file requirements/requirements-draft.md --dry-run
```

### PRレビュー

```bash
npm run review:pr -- --pr 1 --dry-run
```

`--dry-run` を外すとファイル保存（`reviews/` 配下）とGitHubコメント投稿が実行されます。

## レビュー判定ルール

| ルール | 検出内容 | Severity |
|--------|----------|----------|
| `missing-id` | 要件IDなし（FR/NFR-XXX） | high |
| `missing-acceptance` | 受入条件なし | must→critical, should→high, could→medium |
| `ambiguous-word` | 曖昧語（適切に、できるだけ等） | medium |
| `missing-nfr` | NFRセクション欠落 | high〜medium |

## トラブルシュート

### GITHUB_TOKEN が未設定

```
Error: GITHUB_TOKEN is not set. Please configure it in .env file.
```

→ `.env` ファイルに `GITHUB_TOKEN` を設定してください。ローカルレビュー（`--file`）では不要です。

### 権限不足

GitHub API で 403 エラーが出る場合、トークンに以下のスコープが必要です:
- `repo`（プライベートリポジトリの場合）
- `public_repo`（パブリックリポジトリの場合）

### パス不正

Windows環境ではパス区切りに注意。相対パスは `path.resolve` で解決されるため、スラッシュ（`/`）で記述してください:

```bash
npm run review:local -- --file requirements/requirements-draft.md
```

### ビルドエラー

```bash
npm run build
```

TypeScript strict mode が有効です。型エラーがある場合は修正してください。

---

## E2E検証手順

### GitHub Actions経由の自動レビュー

#### 1. テストPR作成

```bash
# 新規ブランチ作成
git checkout -b test/review-automation

# 要件ファイル追加・修正
echo "### FR-TEST: テスト要件" >> requirements/requirements-draft.md
git add requirements/requirements-draft.md
git commit -m "test: add sample requirement for review test"
git push origin test/review-automation

# PR作成
gh pr create --title "Test: Requirements Review Automation" \
  --body "Testing automated review workflow"
```

#### 2. 期待される動作

1. GitHub Actions `SpecForge Requirements Review` workflowが自動起動
2. `npm ci` + `npm run review:pr -- --pr <number>` が実行される
3. PR内に `<!-- specforge-review -->` マーカー付きコメントが投稿される
4. Check Run `specforge-review-check` がChecksタブに表示される
   - `neutral`: レビュー完了、人間承認待ち
   - `failure`: 品質スコア低下（critical > 0 / score < 5 / high >= 3）

#### 3. コメント更新確認（追コミット）

```bash
# 要件ファイルを修正
echo "- **受入条件**:" >> requirements/requirements-draft.md
echo "  - [ ] テストが通ること" >> requirements/requirements-draft.md
git add requirements/requirements-draft.md
git commit -m "fix: add acceptance criteria"
git push origin test/review-automation
```

期待動作:
- 既存コメントが**更新**される（新規コメント作成ではない）
- 更新時刻とReviewIDが変更される
- 前回のworkflowは `cancel-in-progress` でキャンセルされる

#### 4. 非要件変更の確認

`requirements/` 外のファイルのみを変更するPRを作成:

```bash
git checkout -b test/no-requirements
echo "# Update" >> README.md
git add README.md
git commit -m "docs: update readme"
git push origin test/no-requirements
gh pr create --title "Test: No requirements change"
```

期待動作:
- Workflowは**起動する**（`paths` フィルタなし）
- 要件ファイルが検出されず `neutral` Check Runで即終了
- PRコメントは投稿されない
- branch protectionのチェックはブロックされない

### Check Run と Branch Protection

#### Check Run名

固定値: `specforge-review-check`

workflow名 `SpecForge Requirements Review` とは異なる名前を使用。branch protection設定時は以下を指定:

```
Required status checks:
  - specforge-review-check   ← この名前を使用
```

#### 結論ルール

| 条件 | conclusion |
|------|-----------|
| critical findings > 0 | `failure` |
| quality score < 5 | `failure` |
| high findings >= 3 | `failure` |
| それ以外 | `neutral` |

AIは `success` を返しません（人間承認必須の原則）。

### Webhook HMAC署名検証

#### 設定手順

1. `.env` に `GITHUB_WEBHOOK_SECRET` を設定:

```env
GITHUB_WEBHOOK_SECRET=your_random_secret_string
```

2. GitHubリポジトリ設定 > Webhooks で同じSecretを設定:
   - Payload URL: `https://your-domain.com/api/webhooks/github`
   - Content type: `application/json`
   - Secret: `.env` の `GITHUB_WEBHOOK_SECRET` と同一値
   - Events: `Pull requests` のみ

#### 運用モード

| NODE_ENV | Secret未設定時の挙動 |
|----------|-------------------|
| `development` / `test` | 警告ログ出力しスキップ（開発利便性） |
| `production` | **401 Unauthorized** 返却（fail-open防止） |

### Concurrency制御

同一PRで `synchronize` イベントが連続発火した場合:

```yaml
concurrency:
  group: review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

前回のworkflow実行がキャンセルされ、最新のコミットのみレビューされます。

### 複数ファイルレビュー

PR内で複数の `requirements/**` ファイルが変更された場合:
- 全ファイルを個別にレビュー
- 結果を集約（findings統合、品質スコア再計算）
- PRコメントにファイル別サマリーテーブルを表示
- Check Runは集約後の品質スコアで判定
