/**
 * Gemini 通常系スモークテスト
 *
 * 実 GEMINI_API_KEY を使い、Gemini 経路が正しく動作することを検証する。
 * - GET /api/public/status → provider 設定確認
 * - POST /api/review/run (dryRun) → レビュー実行 + fallbackUsed !== true
 *
 * 使用方法:
 *   npm run smoke:gemini          # ローカル（キー未設定時は exit 1）
 *   npm run smoke:gemini:ci       # CI（キー未設定時は [SKIP] + exit 0）
 */

import { createChecker, startServer, fetchJson } from './lib/smoke-helpers.js';

const CI_MODE = process.argv.includes('--ci');

async function main() {
  // --- Pre-flight: API key check ---
  if (!process.env.GEMINI_API_KEY) {
    if (CI_MODE) {
      console.log('[SKIP] GEMINI_API_KEY is not set – skipping Gemini smoke test in CI');
      process.exit(0);
    }
    console.error('[FAIL] GEMINI_API_KEY is not set. Set it in .env or environment.');
    process.exit(1);
  }

  const { app } = await import('../src/app.js');
  const { check, summary } = createChecker();
  let { baseUrl, close } = await startServer(app);
  let closed = false;

  try {
    console.log(`\n=== Gemini Smoke Test (${baseUrl}) ===\n`);

    // --- 1. Status endpoint ---
    console.log('[Step 1] GET /api/public/status');
    const status = await fetchJson(`${baseUrl}/api/public/status`);
    check('status returns 200', status.status === 200);
    check(
      'configuredProvider === "gemini"',
      status.body.configuredProvider === 'gemini',
      `got: ${status.body.configuredProvider}`,
    );
    check(
      'effectiveProvider === "gemini"',
      status.body.effectiveProvider === 'gemini',
      `got: ${status.body.effectiveProvider}`,
    );

    // --- 2. Review execution ---
    console.log('\n[Step 2] POST /api/review/run (dryRun, source=file)');
    const review = await fetchJson(`${baseUrl}/api/review/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/smoke/sample-requirements.md',
        dryRun: true,
      }),
      timeoutMs: 120_000,
    });

    check('review returns 200', review.status === 200);
    check(
      'summary.totalFindings is number',
      typeof review.body?.summary?.totalFindings === 'number',
      `got: ${review.body?.summary?.totalFindings}`,
    );
    check(
      'effectiveProvider === "gemini"',
      review.body?.metadata?.reviewProvider?.effectiveProvider === 'gemini',
      `got: ${review.body?.metadata?.reviewProvider?.effectiveProvider}`,
    );
    check(
      'fallbackUsed !== true (no silent fallback)',
      review.body?.metadata?.reviewProvider?.fallbackUsed !== true,
      `got: ${review.body?.metadata?.reviewProvider?.fallbackUsed}`,
    );

    // --- Summary & cleanup ---
    const { ok } = summary();
    await close();
    closed = true;
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (!closed) {
      await close().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exitCode = 1;
});
