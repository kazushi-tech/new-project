# Phase 2: GitHub PR完全自動レビュー実装プラン

## Context

バックエンドMVP（PR #2）ではレビューエンジン・CLI・Webhook基盤を構築したが、GitHub Actions workflowはプレースホルダーコメントを投稿するのみで、実際のレビューエンジンを呼び出していない。本フェーズではworkflowからCLIを実行し、複数ファイル集約レビュー・HMAC署名検証・Check結論ルールを追加して「PRを起点に完全自動でレビューコメントが更新される状態」を実現する。

---

## Step 1: GitHub Actions Workflow → CLI接続

**ファイル**: [requirements-review.yml](.github/workflows/requirements-review.yml)

現在のinline `actions/github-script`（行23-119）を全削除し、Node.jsセットアップ + `npm run review:pr` 実行に置換。

### 1a. pathsフィルタ削除 + 必須チェック詰まり対策

**問題**: `paths: requirements/**` のまま branch protection の必須チェックにすると、要件外PRでworkflowが起動せずチェックが永久にPending状態になる。

**対策**: `paths` フィルタを削除し、全PRで起動。CLI側で `requirements/**` ファイルがなければ即座にneutral Check Runを返して正常終了する。

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    # paths フィルタなし — 全PRで起動し、CLI内で早期退出
```

### 1b. concurrency によるrace対策

同一PRで `synchronize` イベントが連続発火するとコメント更新が競合する。`concurrency` で同一PRの前回実行をキャンセル。

```yaml
concurrency:
  group: review-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

### 1c. Workflow全体構成

```yaml
name: SpecForge Requirements Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

concurrency:
  group: review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  requirements-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - name: Run requirements review
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_OWNER: ${{ github.repository_owner }}
          GITHUB_REPO: ${{ github.event.repository.name }}
          GITHUB_SHA: ${{ github.event.pull_request.head.sha }}
        run: npm run review:pr -- --pr ${{ github.event.pull_request.number }}
```

---

## Step 2: 複数ファイル集約レビュー

### 2a. 型拡張 — [types.ts](server/src/types.ts)

`ReviewResult`に以下を追加:
- `metadata.source.paths?: string[]` — 複数ファイルパス
- `summary.fileCount?: number` — レビュー対象ファイル数
- `fileResults?: FileReviewSummary[]` — ファイル別サマリー

新規型:
```typescript
export interface FileReviewSummary {
  path: string;
  findingCount: number;
  qualityScore: number;
  bySeverity: Record<Severity, number>;
}
```

### 2b. 集約関数 — [review-engine.ts](server/src/engine/review-engine.ts)

`aggregateReviewResults(results: ReviewResult[]): ReviewResult` を新規エクスポート。
- 既存の `calculateQualityScore` / `countBySeverity` / `assignFindingIds` を再利用
- 全findingsをマージ → ID再採番 → スコア再計算
- ファイル別サマリー生成
- 1件の場合はそのまま返却（後方互換）

### 2c. CLI修正 — [review-pr.ts](server/src/cli/review-pr.ts)

行61-62の `const result = allResults[0]` を `aggregateReviewResults(allResults)` に置換。ファイル別サマリーをコンソール出力に追加。

**要件ファイル0件時の早期退出**: `files.length === 0` の場合、neutral Check Runを作成して正常終了（exit 0）。これにより要件外PRでもチェックが完了状態になる。

```typescript
if (files.length === 0) {
  console.log('No requirements files changed in this PR.');
  const headSha = process.env.GITHUB_SHA;
  if (headSha) {
    await createCheckRun({ headSha, conclusion: 'neutral', title: 'No requirements files changed' });
  }
  return; // exit 0
}
```

### 2d. レポート生成修正 — [report-generator.ts](server/src/engine/report-generator.ts)

`fileResults`が複数ある場合、Quality Score前にファイル別テーブルを挿入:
```
### Files Reviewed
| File | Findings | Score |
|------|----------|-------|
| `requirements/draft.md` | 3 | 7.5/10 |
```

### 2e. Webhook修正 — [webhook.ts](server/src/routes/webhook.ts)

行34-45の「first file with content」ロジックを全ファイルループ + `aggregateReviewResults` に置換。

---

## Step 3: Webhook HMAC署名検証

### 3a. Config拡張 — [config.ts](server/src/config.ts)

`env`に追加:
- `githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? ''`

### 3b. 検証ミドルウェア新規作成 — `server/src/middleware/verify-github-signature.ts`

- `x-hub-signature-256` ヘッダからシグネチャ取得
- `crypto.createHmac('sha256', secret)` で期待値計算
- `crypto.timingSafeEqual` で安全比較
- 不一致時 → 401返却
- Honoの制約: `c.req.text()` でraw body取得後、`JSON.parse` して `c.set('webhookPayload', parsed)` に格納

### 3c. 運用モード明確化（fail-open防止）

`GITHUB_WEBHOOK_SECRET` 未設定時の挙動を `NODE_ENV` で分岐:

| NODE_ENV | Secret未設定時 |
|----------|--------------|
| `development` / `test` | 警告ログ出力しスキップ（開発利便性） |
| `production` | **401 Unauthorized** 返却（fail-open防止） |

```typescript
if (!env.githubWebhookSecret) {
  if (env.nodeEnv === 'production') {
    return c.json({ error: 'Webhook secret not configured' }, 401);
  }
  console.warn('[WARN] GITHUB_WEBHOOK_SECRET not set - skipping verification (dev mode only)');
  return next();
}
```

### 3d. Webhook適用 — [webhook.ts](server/src/routes/webhook.ts)

ミドルウェアをルートハンドラの前に挿入。payload取得を `c.get('webhookPayload') ?? await c.req.json()` に変更。

---

## Step 4: Check結論ルール

### 4a. Checks モジュール新規作成 — `server/src/github/checks.ts`

**Check Run名を固定**: `specforge-review-check`（workflow名 `SpecForge Requirements Review` と衝突回避）

```typescript
const CHECK_NAME = 'specforge-review-check';
```

結論判定:
```typescript
export function determineConclusion(result: ReviewResult): 'failure' | 'neutral'
```
- `critical > 0` → `failure`
- `qualityScore < 5` → `failure`
- `high >= 3` → `failure`
- それ以外 → `neutral`（AIは `success` にしない = 人間承認必須の原則）

Check Run作成:
```typescript
export async function createCheckRun(opts: {
  headSha: string;
  result?: ReviewResult;
  conclusion: 'failure' | 'neutral';
  title?: string;
})
```
- `octokit.checks.create({ name: CHECK_NAME, ... })` でCheck Run作成
- output.title / summary / text にスコアとfindings概要
- `result` なしの場合（要件外PR）は簡易メッセージのみ

### 4b. Branch Protection設定の一致

必須チェック名を `specforge-review-check` に統一。ドキュメントにbranch protection設定手順を明記:

```
Required status checks:
  - specforge-review-check   ← Check Run名（固定）
  # 注: workflow名 "SpecForge Requirements Review" ではない
```

### 4c. CLI統合 — [review-pr.ts](server/src/cli/review-pr.ts)

コメント投稿後、`process.env.GITHUB_SHA` が存在する場合のみCheck Run作成（ローカル実行時はスキップ）。要件ファイル0件時もneutral Check Runを作成（Step 2cに記載）。

### 4d. Webhook統合 — [webhook.ts](server/src/routes/webhook.ts)

`payload.pull_request.head.sha` からCheck Run作成。レスポンスに `check: { id, conclusion }` を追加。

---

## Step 5: テスト追加・更新

### 新規テスト
- `server/__tests__/unit/middleware/verify-github-signature.test.ts` — 正常署名 / 不正署名 / ヘッダ欠落 / dev環境Secret未設定スキップ / prod環境Secret未設定401
- `server/__tests__/unit/engine/aggregate.test.ts` — 単一結果 / 複数結果 / 空配列
- `server/__tests__/unit/github/checks.test.ts` — conclusion判定ロジック（critical→failure, low→neutral等）+ Check Run名固定確認 + 要件外PR neutral

### 既存テスト更新
- `server/__tests__/integration/webhook-flow.test.ts` — Check Run mock追加、集約レビュー検証、HMAC署名mock
- `server/__tests__/unit/github/comment.test.ts` — 変更不要（既存upsertロジック維持）

---

## Step 6: E2Eドキュメント追記

**ファイル**: [docs/backend-mvp.md](docs/backend-mvp.md)

追記内容:
1. テストPR作成手順（`requirements/` 配下ファイル変更 → PR作成）
2. 初回コメント投稿の確認方法
3. 追コミットでのコメント更新確認（同一マーカー更新）
4. `requirements/` 外PRでチェックneutral完了の確認
5. Check Run名 `specforge-review-check` とbranch protection設定手順
6. Webhook HMAC検証設定手順（dev/prod運用モード説明）
7. concurrencyによる同時実行制御の説明
8. トラブルシュート

---

## 変更ファイル一覧

| ファイル | 操作 |
|---------|------|
| `.github/workflows/requirements-review.yml` | 大幅修正（paths削除、concurrency追加、CLI接続） |
| `server/src/types.ts` | 型追加（FileReviewSummary、ReviewResult拡張） |
| `server/src/config.ts` | env拡張（githubWebhookSecret） |
| `server/src/engine/review-engine.ts` | 集約関数追加 |
| `server/src/engine/report-generator.ts` | 複数ファイル対応 |
| `server/src/cli/review-pr.ts` | 集約+Check統合+要件外PR早期退出 |
| `server/src/routes/webhook.ts` | HMAC+集約+Check統合 |
| `server/src/middleware/verify-github-signature.ts` | **新規**（HMAC検証、dev/prod分岐） |
| `server/src/github/checks.ts` | **新規**（Check Run作成、固定名、conclusion判定） |
| `server/__tests__/unit/middleware/verify-github-signature.test.ts` | **新規** |
| `server/__tests__/unit/engine/aggregate.test.ts` | **新規** |
| `server/__tests__/unit/github/checks.test.ts` | **新規** |
| `server/__tests__/integration/webhook-flow.test.ts` | 更新 |
| `docs/backend-mvp.md` | E2E手順追記 |
| `.env.example` | WEBHOOK_SECRET追加 |

---

## 検証手順

1. `npm test` — 全テスト通過
2. `npm run build` — TypeScriptコンパイル成功
3. `npm run review:pr -- --pr <number> --dry-run` — 集約レビュー動作確認
4. テストPR作成（requirements変更あり） → workflow実行 → コメント投稿 + Check Run `specforge-review-check` 確認
5. 追コミット → 同コメント更新確認（新規作成でないこと）
6. `requirements/` 外変更のみのPR → workflow起動 → neutral Check Run完了 → PRブロックされない
7. concurrency確認: 連続push → 前回ジョブがキャンセルされること

## 実装順序

Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6（順序依存あり: 2→4はCheck作成にReviewResult必要、3は独立だがwebhook修正と合わせて実装）
