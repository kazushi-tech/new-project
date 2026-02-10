# Backend MVP 実装計画: 要件定義添削マシン

## Context

Phase 1（GitHub PR連携の骨格）は完了済み。現在 `.github/workflows/requirements-review.yml` がPRコメントのプレースホルダを投稿しているが、実際のレビューロジックは未実装。本計画では **ルールベースのレビューエンジン + HTTP API + GitHub連携** を実装し、ローカルで再現可能なレビュー処理を動かすことを目的とする。UIは作らない。

## 技術選定

| 項目 | 選定 | 理由 |
|------|------|------|
| HTTP Framework | **Hono** + `@hono/node-server` | 軽量、TypeScript-first、ESM対応。既存planでもHonoを採用方針 |
| Test Framework | **vitest** | ESMネイティブ、高速、TypeScript設定不要 |
| GitHub API | **@octokit/rest** | 標準的、型安全、トークン管理容易 |
| Config | **yaml** パッケージ | `.specforge/config.yml` の読み込みに必要 |
| Env | **dotenv** | `.env` からの環境変数読み込み |
| Dev Server | **tsx** | TypeScript直接実行（ビルド不要で開発） |

## ディレクトリ構成

```
server/
  src/
    index.ts                    # エントリポイント（サーバ起動）
    app.ts                      # Hono appインスタンス + ルート登録
    config.ts                   # .specforge/config.yml + .env 読み込み
    types.ts                    # 共有型定義
    routes/
      health.ts                 # GET /health
      review.ts                 # POST /api/review/run
      webhook.ts                # POST /api/webhooks/github
    engine/
      review-engine.ts          # レビュー実行オーケストレータ
      markdown-parser.ts        # 要件Markdown → 構造化データ変換
      report-generator.ts       # findings JSON + Markdown summary 生成
      rules/
        index.ts                # ルール登録・実行レジストリ
        base-rule.ts            # ルール共通インターフェース
        missing-id-rule.ts      # 要件ID（FR/NFR）未記載検出
        missing-acceptance.ts   # 受入条件の欠落検出
        ambiguous-word-rule.ts  # 曖昧語検出
        missing-nfr-rule.ts     # セキュリティ・非機能要件の欠落警告
    github/
      client.ts                 # Octokit初期化・設定
      comment.ts                # PRコメント upsert（マーカーベース）
      pr-files.ts               # PR変更ファイル取得
    cli/
      review-local.ts           # npm run review:local 用
      review-pr.ts              # npm run review:pr 用
  __tests__/
    unit/
      engine/
        review-engine.test.ts
        markdown-parser.test.ts
        rules/
          missing-id-rule.test.ts
          missing-acceptance.test.ts
          ambiguous-word-rule.test.ts
          missing-nfr-rule.test.ts
      github/
        comment.test.ts
    integration/
      webhook-flow.test.ts
```

## 主要な型定義 (`server/src/types.ts`)

```typescript
// ルールベースのレビュー結果
export interface ReviewFinding {
  id: string;                    // FIND-001
  rule: string;                  // ルール識別子
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'completeness' | 'clarity' | 'consistency' | 'testability';
  target?: string;               // 対象要件ID (FR-001等)
  message: string;               // 指摘内容
  suggestion: string;            // [AI提案] 改善提案
  line?: number;                 // ソース行番号
}

// レビュー実行結果
export interface ReviewResult {
  metadata: {
    reviewId: string;
    timestamp: string;
    source: { type: 'file' | 'pr'; path?: string; prNumber?: number };
    rulesApplied: string[];
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<string, number>;
    qualityScore: number;        // 0-10
  };
  findings: ReviewFinding[];
}

// パース済み要件ドキュメント
export interface ParsedRequirement {
  id?: string;                   // FR-001 / NFR-001 (未記載の場合undefined)
  title: string;
  description: string;
  priority?: string;
  acceptanceCriteria: string[];
  section: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedDocument {
  projectName?: string;
  sections: string[];
  requirements: ParsedRequirement[];
  rawContent: string;
  lines: string[];
  hasSecuritySection: boolean;
  hasNfrSection: boolean;
  hasPerformanceSection: boolean;
  hasAvailabilitySection: boolean;
}

// ルールインターフェース
export interface ReviewRule {
  id: string;
  name: string;
  description: string;
  run(doc: ParsedDocument): ReviewFinding[];
}
```

### severity マッピングに関する注記

ユーザ要件では4段階（critical/high/medium/low）、既存スキーマの `ai_findings` は3段階（critical/major/minor）。本MVPでは **ユーザ要件の4段階を採用**（`unresolved_issues` スキーマとも整合）。`ai_findings` 形式への変換時は high→major, medium→minor, low→minor にマッピングする。

## レビュールール詳細（MVP 4ルール）

### 1. MissingIdRule（要件ID未記載検出）
- **対象**: 要件ブロック（###見出し配下）にFR-XXX / NFR-XXXパターンがない場合
- **severity**: high
- **検出ロジック**: `###` 見出しを走査し、見出し直下テキストに `/^(FR|NFR)-\d{3}/` がマッチしない要件ブロックを検出
- **サンプル検出例**: 「未決定事項」セクション内の項目にID無し

### 2. MissingAcceptanceRule（受入条件の欠落検出）
- **対象**: FR-XXX IDを持つ要件に「受入条件」「受け入れ条件」「Acceptance Criteria」セクションがない場合
- **severity**: must要件→critical、should→high、could→medium
- **検出ロジック**: 各要件ブロック内で受入条件キーワードの有無を確認。NFR要件で具体的指標がないものも検出。
- **サンプル検出例**: NFR-001〜003は指標はあるが受入条件フォーマットではない

### 3. AmbiguousWordRule（曖昧語検出）
- **対象**: 全テキスト内の曖昧表現
- **severity**: medium
- **辞書**:
  - `適切に/適切な` → 具体的な基準値を記載（例: エラーコード+メッセージ）
  - `できるだけ` → 具体的な目標値に置換（例: 95%以上）
  - `迅速に` → 応答時間を数値で定義（例: 3秒以内）
  - `なるべく` → 目標値を明記
  - `十分に` → 定量的な基準を明記
  - `必要に応じて` → 条件を明示的に記述
  - `等/など` → 列挙を網羅するか代表例+基準を記述
  - `速やかに` → 時間制約を数値で定義
  - `柔軟に` → 具体的な変更パターンを列挙
- **サンプル検出例**: FR-005「適切なエラーメッセージ」

### 4. MissingNfrRule（セキュリティ・非機能要件の欠落警告）
- **対象**: ドキュメント全体
- **severity**: high（セキュリティ欠如）/ medium（その他NFR欠如）
- **検出項目**: セキュリティ、パフォーマンス、可用性、監視/ログ、データ保持/プライバシー
- **サンプル検出例**: 監視/ログ要件の欠如、データ保持ポリシー未定義

## 実装ステップ（順序依存あり）

### Step 1: プロジェクト基盤セットアップ
- `npm init` 拡張（依存追加: hono, @hono/node-server, @octokit/rest, yaml, dotenv）
- dev依存追加: typescript, tsx, vitest, @types/node
- package.json scripts 更新
- tsconfig.json の `rootDir` 調整（`server/src` 配下のソースからの相対パスが正しく解決されるよう）
- `.env.example` 作成
- `server/src/` ディレクトリ作成

### Step 2: 型定義 + 設定読み込み
- `server/src/types.ts` - 上記の型定義
- `server/src/config.ts` - `.specforge/config.yml` + `.env` 読み込み。パス解決はWindows対応（`path.resolve`使用）

### Step 3: Markdownパーサー
- `server/src/engine/markdown-parser.ts`
- `###` 見出しベースでセクション分割
- FR-XXX/NFR-XXX パターン検出
- 受入条件ブロック抽出
- 行番号トラッキング

### Step 4: レビュールール実装
- `server/src/engine/rules/base-rule.ts` - ReviewRule インターフェース
- `server/src/engine/rules/index.ts` - ルールレジストリ（全ルール登録・実行）
- 4ルール個別実装（missing-id, missing-acceptance, ambiguous-word, missing-nfr）
- 各ルールの単体テスト

### Step 5: レビューエンジン + レポート生成
- `server/src/engine/review-engine.ts` - パーサー呼び出し → ルール実行 → FIND-XXX ID採番 → 結果集約
- `server/src/engine/report-generator.ts` - ReviewResult → JSON保存 + Markdownレポート生成
- 保存先: `reviews/pr-<number>/review-<timestamp>.json`, `reviews/pr-<number>/latest-report.md`
- ファイルレビュー時は `reviews/local/review-<timestamp>.json`

### Step 6: CLIコマンド
- `server/src/cli/review-local.ts` - `--file <path>` と `--dry-run` オプション
- `server/src/cli/review-pr.ts` - `--pr <number>` と `--dry-run` オプション
- dry-run時はファイル保存・GitHub投稿をスキップしてコンソール出力のみ

### Step 7: HTTP APIサーバ
- `server/src/app.ts` - Honoアプリ + ルート登録
- `server/src/index.ts` - サーバ起動（ポート: 3000、環境変数 `PORT` で変更可）
- `server/src/routes/health.ts` - `GET /health`
- `server/src/routes/review.ts` - `POST /api/review/run`
- `server/src/routes/webhook.ts` - `POST /api/webhooks/github`

### Step 8: GitHub連携
- `server/src/github/client.ts` - Octokit初期化（`GITHUB_TOKEN` から）
- `server/src/github/comment.ts` - `<!-- specforge-review -->` マーカーによるupsert
- `server/src/github/pr-files.ts` - PRの変更ファイル取得
- 既存workflow（requirements-review.yml）との整合: 同じマーカーを使用するため、workflowが先にコメントを作成した場合はバックエンドが更新する形になる

### Step 9: テスト
- 単体テスト: 各ルール、パーサー、レポート生成、コメントupsert
- 統合テスト: webhook payload → レビュー → summary生成（GitHub APIモック）

### Step 10: ドキュメント + Git運用
- `docs/backend-mvp.md` 作成
- 作業ブランチ `feat/backend-review-mvp` でコミット
- PRを作成

## 変更/作成ファイル一覧

### 新規作成
| ファイル | 目的 |
|----------|------|
| `server/src/index.ts` | サーバエントリポイント |
| `server/src/app.ts` | Hono app + ルーティング |
| `server/src/config.ts` | 設定読み込み |
| `server/src/types.ts` | 型定義 |
| `server/src/routes/health.ts` | ヘルスチェック |
| `server/src/routes/review.ts` | レビュー実行API |
| `server/src/routes/webhook.ts` | Webhook受信 |
| `server/src/engine/review-engine.ts` | レビューオーケストレータ |
| `server/src/engine/markdown-parser.ts` | Markdownパーサー |
| `server/src/engine/report-generator.ts` | レポート生成 |
| `server/src/engine/rules/base-rule.ts` | ルール基底 |
| `server/src/engine/rules/index.ts` | ルールレジストリ |
| `server/src/engine/rules/missing-id-rule.ts` | ID未記載検出 |
| `server/src/engine/rules/missing-acceptance.ts` | 受入条件欠落検出 |
| `server/src/engine/rules/ambiguous-word-rule.ts` | 曖昧語検出 |
| `server/src/engine/rules/missing-nfr-rule.ts` | NFR欠落警告 |
| `server/src/github/client.ts` | GitHub APIクライアント |
| `server/src/github/comment.ts` | コメントupsert |
| `server/src/github/pr-files.ts` | PR変更ファイル取得 |
| `server/src/cli/review-local.ts` | ローカルレビューCLI |
| `server/src/cli/review-pr.ts` | PRレビューCLI |
| `server/__tests__/unit/engine/review-engine.test.ts` | エンジン単体テスト |
| `server/__tests__/unit/engine/markdown-parser.test.ts` | パーサー単体テスト |
| `server/__tests__/unit/engine/rules/missing-id-rule.test.ts` | ID検出テスト |
| `server/__tests__/unit/engine/rules/missing-acceptance.test.ts` | 受入条件テスト |
| `server/__tests__/unit/engine/rules/ambiguous-word-rule.test.ts` | 曖昧語テスト |
| `server/__tests__/unit/engine/rules/missing-nfr-rule.test.ts` | NFRテスト |
| `server/__tests__/unit/github/comment.test.ts` | コメントupsertテスト |
| `server/__tests__/integration/webhook-flow.test.ts` | Webhook統合テスト |
| `.env.example` | 環境変数テンプレート |
| `docs/backend-mvp.md` | バックエンドMVPドキュメント |

### 既存ファイル修正
| ファイル | 変更内容 |
|----------|----------|
| `package.json` | dependencies/devDependencies/scripts追加 |
| `tsconfig.json` | rootDir調整（必要に応じて） |

### 変更しないファイル
- `.github/workflows/requirements-review.yml` — 既存workflowは維持。バックエンドは同じマーカーで連携
- `.specforge/config.yml` — 読み取り専用で参照
- `.claude/settings.local.json` — コミット対象外

## APIエンドポイント仕様

### `GET /health`
```json
// Response 200
{ "status": "ok", "version": "0.1.0", "timestamp": "2026-02-07T..." }
```

### `POST /api/review/run`
```json
// Request body
{
  "source": "file",           // "file" | "pr"
  "filePath": "requirements/requirements-draft.md",  // source=file時
  "prNumber": 1,              // source=pr時
  "dryRun": false             // trueならファイル保存・GitHub投稿をスキップ
}

// Response 200
{
  "reviewId": "rev-20260207-143000",
  "summary": { "totalFindings": 5, "bySeverity": {...}, "qualityScore": 7 },
  "findings": [...],
  "report": { "jsonPath": "reviews/...", "markdownPath": "reviews/..." }
}
```

### `POST /api/webhooks/github`
```json
// GitHub pull_request event payload（自動処理）
// X-GitHub-Event: pull_request ヘッダで判定
// Response 200
{ "status": "processed", "reviewId": "..." }
// Response 200 (対象外)
{ "status": "skipped", "reason": "no requirements files changed" }
```

## GitHub コメント upsert ロジック

```
1. issues.listComments(owner, repo, issue_number)
2. comments.find(c => c.body.includes('<!-- specforge-review -->'))
3. if (existing) → issues.updateComment(comment_id, body)
   else          → issues.createComment(issue_number, body)
```

既存の `requirements-review.yml` と同じマーカー `<!-- specforge-review -->` を使用。ワークフローが先にプレースホルダコメントを作成した場合、バックエンドの実行時にそのコメントを更新する形で整合性を維持する。

## package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch server/src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "review:local": "tsx server/src/cli/review-local.ts",
    "review:pr": "tsx server/src/cli/review-pr.ts",
    "lint": "echo 'TODO: add linter'",
    "validate:schema": "..."
  }
}
```

## .env.example

```env
# GitHub
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_OWNER=kazushi-tech
GITHUB_REPO=new-project

# Server
PORT=3000
NODE_ENV=development

# Review (optional overrides)
# REVIEW_PATHS=requirements/**/*.md
```

## 検証計画

### ローカル検証
1. `npm install` — 依存インストール
2. `npm run build` — TypeScriptコンパイル成功
3. `npm run test` — 全テストパス
4. `npm run review:local -- --file requirements/requirements-draft.md --dry-run`
   - サンプル要件に対してfindingsが出力されること
   - 期待: 「適切な」曖昧語検出、NFR受入条件欠落など
5. `npm run dev` → `curl http://localhost:3000/health` → 200レスポンス
6. `curl -X POST http://localhost:3000/api/review/run -H 'Content-Type: application/json' -d '{"source":"file","filePath":"requirements/requirements-draft.md","dryRun":true}'`

### GitHub連携検証（GITHUB_TOKEN設定後）
7. `npm run review:pr -- --pr 1 --dry-run` — PRコメント本文がコンソールに出力
8. dry-run無しで実行 → PRコメントがupsertされること

## デフォルト採用事項

| 判断 | 採用値 | 理由 |
|------|--------|------|
| サーバポート | 3000 | Node.js標準的デフォルト |
| qualityScore計算 | 10 - (findings重み付き合計) | MVP簡易計算。critical=2, high=1.5, medium=0.5, low=0.25 |
| Webhookシークレット検証 | 未実装（MVP） | ローカル開発優先。Phase 2でHMAC検証追加 |
| レビュー保存先 | `reviews/pr-{number}/` or `reviews/local/` | ユーザ要件に準拠 |
| TypeScript strict | 維持 | 既存tsconfig設定を尊重 |
