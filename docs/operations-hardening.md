# 運用ハードニングガイド

SpecForge Review の本番運用に必要なセキュリティ・コスト管理・API制限の設定手順。
すべての手順は **GitHub Web UI + VSCode** のみで実施可能（gh CLI不要）。

---

## 1. 許可API一覧

| API | プロバイダ | 用途 | 認証方法 |
|-----|-----------|------|----------|
| GitHub REST API | GitHub | PR操作、Checks、コメント | `GITHUB_TOKEN`（自動付与） |
| GitHub GraphQL API | GitHub | 将来拡張用（現在未使用） | `GITHUB_TOKEN` |
| Google Gemini 2.5 Flash | Google | 将来のAIレビュー機能用（現在未使用） | `GEMINI_API_KEY`（GitHub Secrets） |

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
| `GEMINI_API_KEY` | AI機能使用時 | Google Gemini API キー（将来用） |

> **重要**: 個人PAT（`ghp_*`）をSecretsに登録しない。`GITHUB_TOKEN` を優先使用する。

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

### 6.2 GEMINI_API_KEY のローテーション（将来用）

1. [Google AI Studio](https://aistudio.google.com/apikey) で新しいAPIキーを生成
2. 旧キーを無効化
3. **GitHub リポジトリ > Settings > Secrets and variables > Actions**
4. `GEMINI_API_KEY` を新しい値で更新

### 6.3 ローテーション頻度

| キー | 推奨頻度 | 即時ローテーション条件 |
|------|----------|----------------------|
| `GITHUB_WEBHOOK_SECRET` | 90日ごと | 漏洩疑い時 |
| `GEMINI_API_KEY` | 90日ごと | 漏洩疑い、異常利用検知時 |
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
