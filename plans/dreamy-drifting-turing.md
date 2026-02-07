# GitHub Integration MVP Implementation Plan

## Context

`plans/abstract-floating-bubble.md` に定義された SpecForge Review の Phase 1（GitHub連携MVP）を実装する。
現状リポジトリは Git 未初期化、`.github/` `requirements/` `reviews/` `docs/` は未作成。
目標: PR駆動の要件レビューワークフローが GitHub 上で実際に動作する最小構成を構築する。

---

## Execution Steps

### Step 1: Git初期化 + ベースラインコミット

1. `.gitignore` を作成（node_modules, .env, OS artifacts, IDE, build output）
2. `.gitattributes` を作成（Windows CRLF→LF変換、YAML/MD/SH は LF 強制）
3. `git init`
4. `git add .` → `git commit -m "chore: initialize repository"`

### Step 2: Feature ブランチ作成

- `git checkout -b feat/github-integration-mvp`

### Step 3: 必須ファイル作成（全9ファイル）

以下を並行して作成:

| # | Path | 概要 |
|---|------|------|
| 1 | `.github/workflows/requirements-review.yml` | GitHub Actions ワークフロー（核心） |
| 2 | `.github/CODEOWNERS` | `/requirements/` のオーナー定義 |
| 3 | `.github/PULL_REQUEST_TEMPLATE.md` | PR テンプレート |
| 4 | `.github/ISSUE_TEMPLATE/requirements.yml` | Issue テンプレート（YAML form） |
| 5 | `requirements/.gitkeep` | 空ディレクトリ保持 |
| 6 | `reviews/.gitkeep` | 空ディレクトリ保持 |
| 7 | `docs/github-branch-protection.md` | ブランチ保護設定手順書 |

### Step 4: コミット

- `git add .github/ requirements/ reviews/ docs/`
- `git commit -m "feat: add GitHub review workflow and governance templates"`

### Step 5: 動作確認

- 全ファイル存在確認
- YAML 構文チェック（インデント目視）
- `git log --oneline` でコミット履歴確認
- `git status` でクリーン確認

---

## Key File Details

### `.github/workflows/requirements-review.yml`

- **Trigger**: `pull_request` on `requirements/**`（opened, synchronize, reopened）
- **Permissions**: `contents: read`, `pull-requests: write`, `checks: write`
- **依存アクション**: `actions/checkout@v4` + `actions/github-script@v7`（外部依存なし）
- **処理フロー**:
  1. `pulls.listFiles` で `requirements/**` の変更ファイル検出
  2. `<!-- specforge-review -->` マーカーで既存コメント検索
  3. 既存あり → `updateComment`、なし → `createComment`（重複防止）
- **コメント文面**: 変更ファイル一覧 + レビューサマリ + 「[AI提案]は提案のみ、人間が承認」明記

### `.github/CODEOWNERS`

```
/requirements/ @REPLACE_ME_OWNER
```
- プレースホルダー使用（最終報告で「要置換」を明記）

### `.github/PULL_REQUEST_TEMPLATE.md`

- 変更概要 / 変更理由 / 影響範囲 / 要件ID / AI提案の取り扱い（採用/不採用テーブル）/ 人間承認チェック欄
- 日英バイリンガルヘッダー

### `.github/ISSUE_TEMPLATE/requirements.yml`

- GitHub YAML issue forms 形式（Markdown template ではない）
- 必須: 要件ID, 背景・目的, スコープ, 受入条件
- 任意: 非機能要件, 未決定事項
- ラベル自動付与: `requirements`

### `docs/github-branch-protection.md`

- GitHub UI でのブランチ保護設定手順（ステップバイステップ）
- Require PR / Require approvals / Require CODEOWNERS / Require status checks (`requirements-review`) / Do not allow bypassing
- トラブルシューティング表付き

### `.gitattributes`（追加）

```
* text=auto
*.yml text eol=lf
*.yaml text eol=lf
*.md text eol=lf
```
- Windows環境でYAML/MDがCRLFになるとGitHub Actionsで問題が起きるため必須

---

## Critical Files (Reference)

| File | Purpose |
|------|---------|
| [abstract-floating-bubble.md](plans/abstract-floating-bubble.md) | 元の設計仕様（読取専用参照） |
| [CLAUDE.md](CLAUDE.md) | プロジェクト規約 |

---

## Post-Implementation: Human Actions

Remote 未設定のため push 不可。最終報告に以下を記載:

```bash
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
git push -u origin feat/github-integration-mvp
```

GitHub上で:
1. `feat/github-integration-mvp` → `main` の PR 作成
2. CODEOWNERS の `@REPLACE_ME_OWNER` を実ユーザーに置換
3. `docs/github-branch-protection.md` に従いブランチ保護を設定

---

## Verification

1. `git log --oneline --all` で 2 コミット + 2 ブランチ確認
2. 全ファイルパスの存在確認（Glob）
3. Workflow YAML のインデント・構文確認
4. `git status` がクリーンであること
5. GitHub push 後: テスト PR 作成 → ワークフロー発火 → コメント投稿を確認
