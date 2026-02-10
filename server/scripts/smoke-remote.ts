/**
 * リモートスモークテスト
 *
 * デプロイ済みの SpecForge Review サーバーに対してヘルスチェック・ステータス検証を行う。
 * ローカルサーバーは起動しない（純粋な HTTP クライアントスクリプト）。
 *
 * 使用方法:
 *   BASE_URL=https://specforge-review.onrender.com npm run smoke:remote
 *   BASE_URL=https://specforge-review.onrender.com ADMIN_UI_TOKEN=xxx npm run smoke:remote
 */

import { createChecker, fetchJson } from './lib/smoke-helpers.js';

const TIMEOUT_MS = 30_000;

async function main() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    console.error('[FAIL] BASE_URL environment variable is required.');
    console.error('Usage: BASE_URL=https://your-server.onrender.com npm run smoke:remote');
    process.exit(1);
  }

  const base = baseUrl.replace(/\/+$/, '');
  const adminToken = process.env.ADMIN_UI_TOKEN;
  const { check, summary } = createChecker();

  console.log(`\n=== Remote Smoke Test (${base}) ===\n`);

  // --- Step 1: Health check ---
  console.log('[Step 1] GET /health');
  const health = await fetchJson(`${base}/health`, { timeoutMs: TIMEOUT_MS });
  check('health returns 200', health.status === 200, `status: ${health.status}`);
  check('health status is ok', health.body?.status === 'ok', `got: ${health.body?.status}`);

  // --- Step 2: Public status ---
  console.log('\n[Step 2] GET /api/public/status');
  const status = await fetchJson(`${base}/api/public/status`, { timeoutMs: TIMEOUT_MS });
  check('status returns 200', status.status === 200, `status: ${status.status}`);

  const ep = status.body?.effectiveProvider;
  check(
    'effectiveProvider is valid',
    ep === 'gemini' || ep === 'rule-based',
    `got: ${ep}`,
  );

  const gc = status.body?.geminiConfigured;
  check(
    'geminiConfigured is boolean',
    typeof gc === 'boolean',
    `got: ${typeof gc}`,
  );

  // Consistency: if gemini not configured, effective must not be gemini
  if (gc === false) {
    check(
      'consistency: !geminiConfigured → effectiveProvider !== "gemini"',
      ep !== 'gemini',
      `effectiveProvider: ${ep}`,
    );
  }

  // --- Step 3: Latest reviews (optional) ---
  if (adminToken) {
    console.log('\n[Step 3] GET /api/public/reviews/latest (with x-admin-token)');
    const reviews = await fetchJson(`${base}/api/public/reviews/latest`, {
      headers: { 'x-admin-token': adminToken },
      timeoutMs: TIMEOUT_MS,
    });
    // 200 (review exists) or 404 (no reviews yet) are both acceptable
    check(
      'reviews/latest returns 200 or 404',
      reviews.status === 200 || reviews.status === 404,
      `status: ${reviews.status}`,
    );
  } else {
    console.log('\n[Step 3] SKIP /api/public/reviews/latest (ADMIN_UI_TOKEN not set)');
  }

  // --- Summary ---
  const { ok } = summary();
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exitCode = 1;
});
