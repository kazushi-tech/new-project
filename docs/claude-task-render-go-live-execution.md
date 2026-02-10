# Claude依頼タスク: 単独運用移行差分の最終確定（差分整理・コミット・Push）

## 目的
- 単独運用化で作成した差分を、対象ファイルだけ安全にコミットする。
- 無関係差分（ローカル設定・作業メモ・一時ファイル）をコミット対象から除外する。
- `feat/backend-review-mvp` へ push し、次の作業へ進める状態にする。

## 背景（2026-02-10 時点）
- 単独運用化の実装・ドキュメント更新は完了済み。
- ビルド・テスト・`review:solo:dry` も成功報告済み。
- 未コミットの差分に、今回対象外ファイルが混在している。

## このタスクでClaudeにやってほしいこと
- CLIで差分を再確認し、コミット対象を厳密に絞る。
- 検証コマンドを再実行して、結果が成功であることを確認してからコミットする。
- コミット後に push し、実行結果を短く報告する。

## 事前入力（不足時は最初に依頼者へ確認）
- 使用するコミットメッセージ（未指定時のデフォルトあり）
- push 先ブランチ（未指定時は現在ブランチ）

## コミット対象（このタスクで含める）
- `package.json`
- `.env.example`
- `docs/deploy-render.md`
- `docs/gemini-go-live-checklist.md`
- `docs/operations-hardening.md`
- `docs/claude-task-render-go-live-execution.md`
- `docs/solo-operation-runbook.md`
- `templates/solo/ai-review-task-template.md`

## 除外対象（このタスクでは絶対に含めない）
- `.claude/settings.local.json`
- `_nul_file`
- `plans/*.md`
- `docs/claude-task-deploy-render-vercel.md`
- `docs/claude-task-gemini-go-live.md`
- `docs/claude-task-gemini-only.md`
- 上記以外の今回無関係な変更

## 実行手順（Claude向け）

### Step 0: 安全確認（必須）
- 実行:
  - `git status -sb`
  - `git diff --name-only`
  - `git diff --cached --name-only`
- 判定:
  - 変更一覧とステージ一覧を把握し、対象外差分が混在していることを明示する。

### Step 1: 成果物の再検証（必須）
- 実行:
  - `npm run build`
  - `npm test`
  - `npm run review:solo:dry -- --file requirements/smoke/sample-requirements.md`
- 判定:
  - 3コマンドすべて `exit 0`。
  - 1つでも失敗したらコミットを中断し、原因を報告する。

### Step 2: 対象ファイル差分レビュー（必須）
- 実行:
  - `git diff -- package.json .env.example docs/deploy-render.md docs/gemini-go-live-checklist.md docs/operations-hardening.md docs/claude-task-render-go-live-execution.md docs/solo-operation-runbook.md templates/solo/ai-review-task-template.md`
- 判定:
  - 変更が単独運用移行の意図と一致していること。

### Step 3: 対象ファイルのみステージ（必須）
- 実行:
  - `git add package.json .env.example docs/deploy-render.md docs/gemini-go-live-checklist.md docs/operations-hardening.md docs/claude-task-render-go-live-execution.md docs/solo-operation-runbook.md templates/solo/ai-review-task-template.md`
- 補助確認:
  - `git diff --cached --name-only`
- 判定:
  - ステージ済みファイルが「コミット対象8件」と完全一致すること。

### Step 4: コミット（必須）
- デフォルトメッセージ:
  - `docs: finalize solo-operation workflow and task templates`
- 実行:
  - `git commit -m "docs: finalize solo-operation workflow and task templates"`
- 判定:
  - 1コミットで作成されること。

### Step 5: Push（必須）
- 実行:
  - `git branch --show-current`
  - `git push origin <current-branch>`
- 判定:
  - push 成功。

### Step 6: 完了報告（必須）
- 以下をまとめて報告:
  - コミットハッシュ
  - コミット対象ファイル一覧
  - `npm run build` / `npm test` / `npm run review:solo:dry` の結果
  - push 先ブランチ
  - 除外対象をコミットしていないことの確認

## 受け入れ条件
1. 対象8ファイルのみがコミットされている。
2. 除外対象ファイルがコミットに含まれていない。
3. `npm run build` / `npm test` / `npm run review:solo:dry` がすべて成功している。
4. 現在ブランチへの push が完了している。
5. 実行ログ要約とコミットハッシュが報告されている。

## 完了報告フォーマット（Claude向け）
- 実施日（YYYY-MM-DD）
- 実施ブランチ
- コミットハッシュ
- コミットメッセージ
- 変更ファイル一覧
- 検証結果:
  - `npm run build`
  - `npm test`
  - `npm run review:solo:dry -- --file requirements/smoke/sample-requirements.md`
- push 結果
- 除外対象が未コミットであることの確認
- 残課題（あれば）

## 実行時の注意
- `.env` 実値やトークンなど機密情報を出力・コミットしない。
- 無関係差分は保持したままにし、リセットや削除を行わない。
- 失敗時は勝手に再構成せず、失敗理由と次の最小アクションを提示する。
