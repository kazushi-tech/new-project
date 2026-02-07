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
