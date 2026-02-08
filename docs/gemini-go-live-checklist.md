# Gemini Go-Live チェックリスト

Gemini AIレビューエンジンを本番有効化する際の手順書。

---

## 1. 事前準備

### 必須 Secrets / ENV

| 変数名 | 設定先 | 説明 |
|---------|--------|------|
| `GEMINI_API_KEY` | GitHub Secrets / `.env` | Google AI Studio で取得した API キー |
| `REVIEW_PROVIDER` | GitHub Secrets / `.env` | `gemini` または `auto`（推奨: `auto`） |
| `ADMIN_UI_TOKEN` | GitHub Secrets / `.env` | Admin UI アクセス制御トークン |

### 確認事項

- [ ] `GEMINI_API_KEY` が有効であること（Google AI Studio で確認）
- [ ] `.env` の実値がリポジトリにコミットされていないこと
- [ ] `npm run build` が成功すること
- [ ] `npm test` が全件パスすること

---

## 2. ローカル確認

```bash
# 一括実行（通常系 + フォールバック）
npm run smoke:go-live
```

### 期待される結果

- `smoke:gemini`: 全 PASS
  - `configuredProvider === "gemini"`
  - `effectiveProvider === "gemini"`
  - `fallbackUsed !== true`
- `smoke:fallback`: 全 PASS
  - `fallbackUsed === true`
  - `effectiveProvider === "rule-based"`
  - `fallbackReason` が空でない

---

## 3. ステージング確認

1. ステージング環境に `GEMINI_API_KEY` と `REVIEW_PROVIDER=auto` を設定
2. デプロイ後、status API を確認:
   ```
   GET /api/public/status
   → effectiveProvider: "gemini"
   ```
3. テスト PR を作成し、レビューが Gemini 経由で実行されることを確認

---

## 3.5 Render デプロイ確認

### 初回デプロイ

1. `render.yaml` がリポジトリルートに存在することを確認
2. Render Dashboard → New → Blueprint → リポジトリ接続
3. 環境変数を設定:
   - `GEMINI_API_KEY`: Google AI Studio で取得したキー
   - `REVIEW_PROVIDER`: `auto`（推奨）
   - `ADMIN_UI_TOKEN`: 自動生成 or 手動設定
4. Deploy を実行

### デプロイ後検証

```bash
# リモートスモークテスト
BASE_URL=https://<service-name>.onrender.com npm run smoke:remote

# Admin 込みの検証
BASE_URL=https://<service-name>.onrender.com \
  ADMIN_UI_TOKEN=<your-token> \
  npm run smoke:remote
```

### 判定基準

| チェック | コマンド / URL | 合格基準 |
|----------|---------------|----------|
| ヘルスチェック | `GET /health` | `{"status":"ok"}` |
| プロバイダ確認 | `GET /api/public/status` | `effectiveProvider: "gemini"` |
| 一貫性 | `GET /api/public/status` | `geminiConfigured: true` |
| Admin UI | ブラウザで `/admin` | ログインプロンプト表示 |
| リモートスモーク | `npm run smoke:remote` | 全 PASS |

---

## 4. 本番反映手順

### 4.1 GitHub Actions 環境

1. **GitHub Secrets 設定**:
   - `GEMINI_API_KEY` を登録
   - `REVIEW_PROVIDER` を `auto` に設定（未設定でも `auto` がデフォルト）
2. **デプロイ**: 通常のデプロイフローで反映
3. **確認**:
   ```
   GET /api/public/status
   → effectiveProvider: "gemini"
   → geminiConfigured: true
   ```

### 4.2 Render 環境

1. **環境変数設定**: Render Dashboard > Environment
   - `GEMINI_API_KEY` を登録
   - `REVIEW_PROVIDER` を `auto` に設定
2. **デプロイ**: `main` ブランチへの push で自動デプロイ（auto-deploy 有効時）
3. **確認**:
   ```bash
   BASE_URL=https://<service-name>.onrender.com npm run smoke:remote
   ```

---

## 5. ロールバック

Gemini で問題が発生した場合、コード変更なしで即座にロールバック可能。

```
REVIEW_PROVIDER=rule-based
```

### GitHub Actions

- GitHub Secrets の `REVIEW_PROVIDER` を `rule-based` に変更
- または `.env` で `REVIEW_PROVIDER=rule-based` に設定
- 再デプロイ後、`effectiveProvider` が `rule-based` になることを確認

### Render

1. Render Dashboard > Environment で `REVIEW_PROVIDER` を `rule-based` に変更
2. Manual Deploy を実行（環境変数変更は再デプロイが必要）
3. `npm run smoke:remote` で `effectiveProvider: "rule-based"` を確認

---

## 6. 障害時の調査

### 確認ポイント

| 症状 | 確認箇所 | 対応 |
|------|----------|------|
| `effectiveProvider` が `rule-based` に乖離 | サーバーログ / status API | フォールバック発生中。`fallbackReason` を確認 |
| `fallbackReason` に `auth_failure` | API キー | `GEMINI_API_KEY` の有効性を確認。ローテーション実施 |
| `fallbackReason` に `rate_limit` | API クォータ | Google AI Studio でクォータ確認。時間をおいて再試行 |
| `fallbackReason` に `timeout` | ネットワーク / Gemini 側障害 | Gemini サービスステータスを確認 |
| レビュー結果が空 / 異常 | レビューログ | サンプルファイルで `smoke:gemini` を実行し再現確認 |

### CIでの `smoke:gemini:ci` 挙動

| 条件 | 挙動 |
|------|------|
| `GEMINI_API_KEY` 設定済み | 通常実行。失敗時 `exit 1` |
| `GEMINI_API_KEY` 未設定 | `[SKIP]` を表示し `exit 0`（CI を止めない） |
