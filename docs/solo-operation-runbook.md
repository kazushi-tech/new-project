# 単独運用 Runbook

SpecForge Review を **ローカル単独運用** で日常的に使用するための手順書。
サーバデプロイやクラウドサービスは不要。CLI とローカル実行だけで完結する。

---

## 1. 前提条件

- Node.js >= 20.11.0
- `npm ci` 済み
- `.env` に最低限の設定（下記参照）

### 最小 `.env` 設定

```env
NODE_ENV=development
REVIEW_PROVIDER=rule-based
```

> Gemini を使う場合は `GEMINI_API_KEY` を追加し、`REVIEW_PROVIDER=auto` に変更する。

---

## 2. 日次フロー

### 2.1 レビュー実行

```bash
# dry-run（結果を保存せず確認のみ）
npm run review:solo:dry -- --file requirements/path/to/target.md

# 保存あり
npm run review:solo -- --file requirements/path/to/target.md
```

### 2.2 結果確認

- dry-run: コンソール出力で指摘内容・品質スコアを確認
- 保存あり: `reviews/` ディレクトリに JSON + Markdown レポートが出力される

### 2.3 AI 深掘りレビュー

ローカルレビュー結果を Claude Code へ渡し、深掘りレビューを依頼する。

1. `templates/solo/ai-review-task-template.md` をコピー
2. レビュー結果と対象ファイルの内容を記入
3. Claude Code に依頼を投げる

### 2.4 修正反映

- AI の指摘を人間が判断し、必要な修正を対象ファイルに反映
- 修正後に再レビューを実行して品質スコアの改善を確認

---

## 3. 週次 / リリース前フロー

```bash
# 1. 自己点検（ビルド + テスト）
npm run check:solo

# 2. 代表要件のレビュー再実行
npm run review:solo:dry -- --file requirements/smoke/sample-requirements.md

# 3. 全要件の一括確認（必要に応じて）
# 対象ファイルごとに review:solo を実行
```

---

## 4. Go/No-Go 判定表（単独運用版）

| チェック項目 | コマンド | 合格基準 |
|-------------|---------|---------|
| TypeScript ビルド | `npm run build` | exit 0 |
| ユニット/統合テスト | `npm test` | 全件 PASS |
| ローカルレビュー | `npm run review:solo:dry -- --file <対象>` | exit 0、致命的指摘なし |
| AI 深掘り | Claude Code で確認 | 重大リスクの指摘なし |

すべて合格で Go 判定。1 項目でも NG なら修正後に再実行。

---

## 5. 障害時の退避手順

### rule-based 固定モードで継続

Gemini API の障害やキーの問題が発生した場合:

```bash
# .env を編集
REVIEW_PROVIDER=rule-based
```

これにより Gemini を使わず、rule-based エンジンのみで動作を継続できる。
Gemini の問題解消後に `REVIEW_PROVIDER=auto` へ戻す。

### ビルド/テストが壊れた場合

1. `git stash` で作業中の変更を退避
2. `npm run check:solo` で正常状態を確認
3. 問題の切り分け後に `git stash pop` で復帰

---

## 6. コマンド一覧

| コマンド | 説明 |
|---------|------|
| `npm run review:solo -- --file <path>` | ローカルレビュー（結果保存あり） |
| `npm run review:solo:dry -- --file <path>` | ローカルレビュー（dry-run） |
| `npm run check:solo` | 自己点検（ビルド + テスト） |
| `npm run review:local -- --file <path>` | review:solo の元コマンド |
| `npm run build` | TypeScript ビルド |
| `npm test` | テスト実行 |

---

## 7. 拡張運用（オプション）

以下は単独運用では不要だが、必要に応じて利用可能:

| 機能 | 参照 |
|------|------|
| Render デプロイ | [deploy-render.md](./deploy-render.md) |
| GitHub Actions PR レビュー | [operations-hardening.md](./operations-hardening.md) |
| Gemini AI レビュー有効化 | [gemini-go-live-checklist.md](./gemini-go-live-checklist.md) |
