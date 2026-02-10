# 運用ハードニングガイド

SpecForge Review の運用に必要なセキュリティ・コスト管理・API制限の設定手順。

---

## 0. 単独運用の標準フロー（推奨）

本プロジェクトの標準運用は **ローカル単独運用** である。
サーバデプロイやクラウドサービスは不要で、CLI 実行と人手 AI レビューの組み合わせで完結する。

### 日次フロー

```bash
# 1. ローカルレビュー（dry-run）
npm run review:solo:dry -- --file requirements/path/to/target.md

# 2. 結果確認後、Claude Code で深掘りレビュー

# 3. 人間が最終判断し修正反映
```

### 週次 / リリース前

```bash
# ビルド + テスト
npm run check:solo

# 代表要件の再レビュー
npm run review:solo:dry -- --file requirements/smoke/sample-requirements.md
```

詳細は [solo-operation-runbook.md](./solo-operation-runbook.md) を参照。

---

> **以下のセクション（§1〜§9）は、GitHub Actions / Render デプロイなどの拡張運用を行う場合に参照する。**
> 単独運用のみの場合は上記フローで十分であり、以下は必要時のみ使用する。

---

## 1. 許可API一覧

| API | プロバイダ | 用途 | 認証方法 |
|-----|-----------|------|----------|
| GitHub REST API | GitHub | PR操作、Checks、コメント | `GITHUB_TOKEN`（自動付与） |
| GitHub GraphQL API | GitHub | 将来拡張用（現在未使用） | `GITHUB_TOKEN` |
| Google Gemini 2.5 Flash | Google | AIレビューエンジン（`REVIEW_PROVIDER=gemini` 時） | `GEMINI_API_KEY`（GitHub Secrets） |

## 2. 禁止API一覧

以下のAPIは **コード・設定・依存関係での使用を禁止** する。

| API | 理由 |
|-----|------|
| OpenAI API | コスト管理・ベンダーロック回避 |
| Anthropic API | コスト管理・ベンダーロック回避 |
| Cohere API | コスト管理 |
| Azure OpenAI | コスト管理 |
| その他SaaS AI API | 未承認API |

禁止対象の確認方法:
- `package.json` に `openai`, `@anthropic-ai/*`, `cohere-ai`, `@azure/openai` 等のパッケージがないこと
- `.env.example` に `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` 等の変数がないこと
- ソースコード内に上記APIへのHTTP呼び出しがないこと

---

## 3. 本番チェックリスト

### GitHub Secrets 設定（Web UI）

1. リポジトリ > **Settings** > **Secrets and variables** > **Actions**
2. 以下のSecretsを登録:

| Secret名 | 必須 | 説明 |
|-----------|------|------|
| `GITHUB_TOKEN` | 自動 | GitHub Actions自動付与（設定不要） |
| `GITHUB_WEBHOOK_SECRET` | Webhook使用時 | Webhook HMAC検証用ランダム文字列 |
| `GEMINI_API_KEY` | `REVIEW_PROVIDER=gemini` 時 | Google Gemini API キー |
| `REVIEW_PROVIDER` | 任意 | レビュープロバイダ選択（`auto`/`gemini`/`rule-based`、デフォルト: `auto`） |
| `ADMIN_UI_TOKEN` | Admin UI使用時 | Admin UI/APIアクセス制御用トークン |

> **重要**: 個人PAT（`ghp_*`）をSecretsに登録しない。`GITHUB_TOKEN` を優先使用する。

### ADMIN_UI_TOKEN 設定

Admin UI およびレビュー詳細APIへのアクセス制御に使用するトークン。

**設計判断**: UIシェル（HTML/CSS/JS）には機密データを含まないため、データ保護はAPI層で実施する。本番で `ADMIN_UI_TOKEN` 未設定時のみ、静的ファイルも含めて503で遮断する。

**開発環境（NODE_ENV=development）**:

- 未設定時: 警告ログを出力し、アクセス許可
- 設定時: `x-admin-token` ヘッダーでの認証が必要

**本番環境（NODE_ENV=production）**:

- 未設定時: `/admin`, `/ui/*`, `/api/public/reviews/latest` へのアクセスを拒否（503）
- 設定時: `/api/public/reviews/latest` は `x-admin-token` ヘッダー必須（401）

**保護されるエンドポイント**:

- `GET /api/public/reviews/latest` — トークン認証（`x-admin-token` ヘッダー）
- `GET /admin`, `GET /ui/*` — 本番+TOKEN未設定時のみ503

**公開エンドポイント（認証不要）**:

- `GET /api/public/status` — サービスステータス

**トークン生成方法**:
```bash
openssl rand -base64 32
```

**GitHub Actions Secrets 設定**:

1. リポジトリ > Settings > Secrets and variables > Actions
2. New repository secret をクリック
3. Name: `ADMIN_UI_TOKEN` / Value: 生成したトークン
4. Add secret をクリック

**Admin UI アクセス方法**:

1. ブラウザで `/admin` にアクセス
2. ログインプロンプトにトークンを入力
3. トークンは sessionStorage に保存（タブを閉じると削除）

### Gemini 最小運用 `.env` 例

```env
PORT=3000
NODE_ENV=production
ADMIN_UI_TOKEN=<生成したトークン>
REVIEW_PROVIDER=auto
GEMINI_API_KEY=<Google AI Studio で取得したキー>
```

- `REVIEW_PROVIDER=auto`: `GEMINI_API_KEY` が設定されていれば Gemini を使用、未設定なら rule-based にフォールバック
- `REVIEW_PROVIDER=gemini`: Gemini を明示指定。本番で `GEMINI_API_KEY` 未設定時は起動失敗
- `REVIEW_PROVIDER=rule-based`: Gemini を使わず rule-based のみで動作
- GitHub連携変数（`GITHUB_TOKEN` 等）は任意。GitHub機能を使わない場合は不要

### フォールバック仕様

Gemini API が失敗した場合、自動的に rule-based エンジンにフォールバックする。

- フォールバック発生時はサーバログに `[review-engine] Gemini failed, falling back to rule-based` と出力
- レビュー結果の `metadata.reviewProvider` にフォールバック情報を記録:
  - `fallbackUsed: true`
  - `fallbackReason`: エラーの分類と詳細メッセージ
- `GET /api/public/status` の `effectiveProvider` でフォールバック状態を確認可能

**監視ポイント**:

- `effectiveProvider` が `configuredProvider` と異なる場合、フォールバックが発生中
- `fallbackReason` に `auth_failure` が含まれる場合、APIキーの確認が必要
- `fallbackReason` に `rate_limit` が含まれる場合、APIクォータの確認が必要

### Admin 認証ヘッダー仕様

- 正規仕様: `x-admin-token` ヘッダー
- `Authorization: Bearer` は現仕様では利用しない
- レスポンスの `Cache-Control: no-store` により認証済みデータのキャッシュを防止

### NODE_ENV 設定

GitHub Actions環境では `NODE_ENV` を明示設定する必要はない（workflow内で環境変数として設定されない＝`development`扱い）。

Webhook サーバを本番運用する場合:
- `NODE_ENV=production` を設定すること
- `GITHUB_WEBHOOK_SECRET` 未設定時は `401 Unauthorized` が返る（fail-open防止）

### Branch Protection 設定

[github-branch-protection.md](./github-branch-protection.md) の手順に従う。

Required status check名: **`specforge-review-check`**

### Billing 確認（Web UI）

1. GitHub.com > 右上アバター > **Settings** > **Billing and plans**
2. Actions の使用量を確認
3. 月次のSpending limitを設定（推奨: $0 = 無料枠のみ）

---

## 4. Workflow セキュリティ設定

### 4.1 Fork PR の制御（Web UI）

外部コラボレーターからのPRでworkflowが自動実行されることを防ぐ:

1. リポジトリ > **Settings** > **Actions** > **General**
2. **Fork pull request workflows from outside collaborators** セクション
3. **Require approval for all outside collaborators** を選択
4. **Save**

### 4.2 Workflow 権限（Web UI）

1. リポジトリ > **Settings** > **Actions** > **General**
2. **Workflow permissions** セクション
3. **Read repository contents and packages permissions** を選択（最小権限）
4. 個別workflowで必要な権限は `permissions:` ブロックで明示指定

現在のworkflow権限（最小構成）:
```yaml
permissions:
  contents: read          # コードの読み取り
  pull-requests: write    # PRコメント投稿
  checks: write           # Check Run 作成
```

### 4.3 `pull_request_target` 禁止

- 現在のworkflowは `pull_request` トリガーを使用（安全）
- `pull_request_target` は **使用禁止**（Fork PRからのシークレット漏洩リスク）

---

## 5. コスト最小化設定

### 5.1 Workflow タイムアウト

```yaml
timeout-minutes: 5
```

暴走ジョブを5分で強制停止。

### 5.2 早期終了条件

| 条件 | 動作 | API消費 |
|------|------|---------|
| `requirements/` 変更なし | `neutral` Check Run → 終了 | listFiles のみ（1回） |
| ファイル数 > 20 | `neutral` Check Run → 終了 | listFiles のみ（1回） |
| 変更行数 > 5,000 | `neutral` Check Run → 終了 | listFiles のみ（1回） |
| 通常レビュー | 全ファイルレビュー実行 | listFiles + getContent × N |

### 5.3 API呼び出し削減

- `pulls.get()` の不要呼び出しを削除済み（ファイルごとのループ内で未使用の結果を取得していたバグを修正）
- `repos.getContent()` はファイルごとに1回のみ

---

## 6. キーローテーション手順

### 6.1 GITHUB_WEBHOOK_SECRET のローテーション

1. 新しいランダム文字列を生成（32文字以上推奨）
2. **GitHub リポジトリ > Settings > Webhooks** で対象Webhookを編集
3. Secret欄に新しい値を入力して **Update webhook**
4. **GitHub リポジトリ > Settings > Secrets and variables > Actions**
5. `GITHUB_WEBHOOK_SECRET` を新しい値で更新
6. Webhookサーバを再起動（使用している場合）

### 6.2 GEMINI_API_KEY のローテーション

1. [Google AI Studio](https://aistudio.google.com/apikey) で新しいAPIキーを生成
2. 旧キーを無効化
3. **GitHub リポジトリ > Settings > Secrets and variables > Actions**
4. `GEMINI_API_KEY` を新しい値で更新

### 6.3 ローテーション頻度

| キー | 推奨頻度 | 即時ローテーション条件 |
|------|----------|----------------------|
| `GITHUB_WEBHOOK_SECRET` | 90日ごと | 漏洩疑い時 |
| `GEMINI_API_KEY` | 90日ごと | 漏洩疑い、異常利用検知時 |
| `ADMIN_UI_TOKEN` | 90日ごと | 漏洩疑い時 |
| `GITHUB_TOKEN` | 自動管理 | ローテーション不要（Actions自動付与） |

---

## 7. 監視・アラート

### GitHub Actions 使用量

1. GitHub.com > 右上アバター > **Settings** > **Billing and plans**
2. **Actions** の使用時間（分）を月次確認
3. 無料枠: Public = 無制限、Private = 2,000分/月

### Workflow 実行履歴

1. リポジトリ > **Actions** タブ
2. `SpecForge Requirements Review` の実行一覧を確認
3. 失敗した実行のログを確認

---

## 8. トラブルシューティング

| 問題 | 原因 | 対策 |
|------|------|------|
| Check Run が表示されない | workflowが一度も実行されていない | テストPRを作成して実行 |
| `neutral` で即終了 | `requirements/` に変更がない | 正常動作（コスト最小化） |
| Webhook 401エラー | `GITHUB_WEBHOOK_SECRET` 不一致 | キーローテーション手順を実施 |
| API rate limit | 短時間に大量PR | concurrency制御で自動緩和 |
| タイムアウト（5分） | レビュー対象が大きすぎる | ファイル上限で自動スキップ |
| Admin UI 503エラー | 本番で `ADMIN_UI_TOKEN` 未設定 | Secrets に `ADMIN_UI_TOKEN` を登録 |
| Admin UI 401エラー | トークン不一致 | 正しいトークンで再ログイン |

---

## 9. デプロイ前スモークテスト

### 実行手順

```bash
# 1. ビルド
npm run build

# 2. ユニット / 統合テスト
npm test

# 3. スモークテスト一括実行（通常系 + フォールバック）
npm run smoke:go-live
```

### デプロイ前チェック表

| チェック | コマンド | 合格基準 |
|----------|----------|----------|
| ビルド | `npm run build` | exit 0 |
| テスト | `npm test` | 全件 PASS |
| Gemini 通常系 | `npm run smoke:gemini` | 全 PASS、`fallbackUsed !== true` |
| フォールバック | `npm run smoke:fallback` | 全 PASS、`fallbackUsed === true` |

### `configuredProvider` と `effectiveProvider` の乖離時フロー

`GET /api/public/status` で `effectiveProvider` が `configuredProvider` と異なる場合:

1. **即時確認**: サーバーログで `[review-engine] Gemini failed, falling back to rule-based` を検索
2. **原因分類**:
   - `auth_failure` → `GEMINI_API_KEY` が無効。キーローテーション（§6.2）を実施
   - `rate_limit` → API クォータ超過。Google AI Studio でクォータ確認
   - `timeout` → ネットワーク障害 or Gemini 側障害。時間をおいて再確認
3. **一時対応**: `REVIEW_PROVIDER=rule-based` に切り替えてデプロイ
4. **恒久対応**: 原因解消後に `REVIEW_PROVIDER=auto` に戻す

### CI での `smoke:gemini:ci` ポリシー

| 条件 | 挙動 | exit code |
|------|------|-----------|
| `GEMINI_API_KEY` 設定済み | 通常実行 | 成功: 0 / 失敗: 1 |
| `GEMINI_API_KEY` 未設定 | `[SKIP]` 表示 | 0（CI を止めない） |

CI ワークフローでの推奨設定:
```yaml
- name: Smoke test (Gemini)
  run: npm run smoke:gemini:ci
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```
