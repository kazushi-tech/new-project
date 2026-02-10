# Render デプロイガイド（オプション）

> **注記**: Render デプロイは **常時運用の前提ではありません**。
> 本プロジェクトの標準運用はローカル単独運用（[solo-operation-runbook.md](./solo-operation-runbook.md) 参照）です。
> 外部公開やチーム共有が必要な場合のみ、本ガイドに従ってデプロイしてください。

SpecForge Review を Render にデプロイする手順書。

---

## 1. 前提条件

- Render アカウント（https://render.com）
- GitHub リポジトリへのアクセス権
- 必要な API キー（GEMINI_API_KEY 等）の準備

---

## 2. プロジェクト作成

### 2.1 Blueprint（render.yaml）を使った自動作成（推奨）

1. Render Dashboard → **New** → **Blueprint**
2. GitHub リポジトリを接続
3. `render.yaml` が自動検出される
4. 環境変数を確認・設定して **Apply**

### 2.2 手動作成（Web UI）

1. Render Dashboard → **New** → **Web Service**
2. リポジトリを選択
3. 以下を設定:
   - **Name**: `specforge-review`
   - **Runtime**: Node
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/server/src/index.js`
   - **Health Check Path**: `/health`
4. 環境変数を設定（§3 参照）

---

## 3. 環境変数設定

| 変数名 | 必須 | 説明 | 設定方法 |
|--------|------|------|----------|
| `NODE_ENV` | ○ | `production` 固定 | render.yaml で自動設定 |
| `ADMIN_UI_TOKEN` | ○ | Admin UI アクセストークン | render.yaml で自動生成 or Dashboard で手動設定 |
| `GEMINI_API_KEY` | △ | Gemini API キー | Dashboard > Environment で設定 |
| `REVIEW_PROVIDER` | ○ | `auto` / `gemini` / `rule-based` | render.yaml で `auto` 設定 |
| `GITHUB_TOKEN` | × | GitHub API 連携時のみ | Dashboard で設定 |
| `GITHUB_WEBHOOK_SECRET` | × | Webhook 使用時のみ | Dashboard で設定 |

> **△**: `REVIEW_PROVIDER=gemini` または `auto` で Gemini を使う場合に必須。
> `auto` の場合、`GEMINI_API_KEY` 未設定時は自動的に `rule-based` にフォールバックする。

### PORT について

Render は Web Service にデフォルトでポート 10000 を割り当てる。アプリは `PORT` 環境変数を読み取るため、明示的な設定は不要。

---

## 4. デプロイ実行

### 4.1 初回デプロイ

- Blueprint or 手動設定完了後、自動でデプロイが開始される
- Build ログで `npm ci && npm run build` の成功を確認
- Health check（`/health`）が green になることを確認

### 4.2 自動デプロイ（GitHub 連携）

- `main` ブランチへの push で自動デプロイ
- 設定変更: Dashboard > Settings > **Auto-Deploy**

---

## 5. デプロイ後の確認

### 5.1 手動確認

```bash
# ヘルスチェック
curl https://<service-name>.onrender.com/health
# → { "status": "ok", "version": "0.1.0", ... }

# ステータス確認
curl https://<service-name>.onrender.com/api/public/status
# → effectiveProvider, geminiConfigured を確認
```

### 5.2 リモートスモークテスト

```bash
# 基本検証
BASE_URL=https://<service-name>.onrender.com npm run smoke:remote

# Admin 込みの検証
BASE_URL=https://<service-name>.onrender.com \
  ADMIN_UI_TOKEN=<your-token> \
  npm run smoke:remote
```

### 5.3 GitHub Actions による自動実行

GitHub Actions の `Render Smoke Test` ワークフロー（`workflow_dispatch`）で実行可能。

**必要な GitHub Secrets:**

- `RENDER_BASE_URL` — Render サービス URL（例: `https://specforge-review.onrender.com`）
- `ADMIN_UI_TOKEN` — Admin UI トークン

**実行方法:** GitHub リポジトリ > Actions > **Render Smoke Test** > **Run workflow**

URL を一時的に変更する場合は `base_url` 入力でオーバーライド可能。

### 5.4 Admin UI 確認

ブラウザで `https://<service-name>.onrender.com/admin` にアクセスし、`ADMIN_UI_TOKEN` でログイン。

---

## 6. トラブルシューティング

| 症状 | 原因 | 対策 |
|------|------|------|
| Build 失敗 | `npm ci` / `tsc` エラー | Render のビルドログ確認 |
| Health check 失敗 | 起動エラー / PORT 不一致 | サービスログで起動メッセージ確認 |
| Admin UI 503 | `ADMIN_UI_TOKEN` 未設定 | 環境変数を確認・設定 |
| Gemini 未動作 | `GEMINI_API_KEY` 未設定 | `/api/public/status` で `geminiConfigured` 確認 |
| Static files 404 | `ui/` ディレクトリ欠損 | ビルド後のファイル構造を確認（`ui/` は `dist/` 外にある） |

---

## 7. カスタムドメイン（任意）

1. Dashboard > Settings > **Custom Domains**
2. DNS に CNAME レコードを追加
3. TLS 証明書は Render が自動発行

---

## 8. 注意事項

### エフェメラルファイルシステム

Render の Web Service はデプロイごとにファイルシステムがリセットされる。`reviews/` ディレクトリに保存されたレビュー結果はデプロイ時に消失する。

- 現時点では MVP として許容
- 永続化が必要な場合は Render の Persistent Disk または外部ストレージを検討

### コールドスタート（Free / Starter プラン）

Free プランでは 15 分間アクセスがないとサービスがスリープする。初回リクエストに 30〜50 秒かかる場合がある。

---

## 9. Phase 2: Vercel 併用（条件付き）

以下の条件を **1 つ以上** 満たす場合のみ検討する:

- PR ごとのプレビュー URL を、非エンジニア含めて常時共有したい
- UI の見た目確認を本番 API と切り離して高速化したい
- Render Preview Environments の運用要件/コストと合わない

### 実施する場合の設計項目

| 項目 | 内容 |
|------|------|
| Render 担当 | API / Webhook |
| Vercel 担当 | UI（Admin Dashboard） |
| ドメイン分割 | 例: `api.*` / `app.*` |
| CORS | Vercel → Render API のクロスオリジン許可 |
| 認証ヘッダー | `x-admin-token` の扱い |
| Secrets 配置 | Render: API キー類 / Vercel: UI 設定のみ |
| 監視責務 | Render: API ヘルス / Vercel: フロントエンドエラー |
