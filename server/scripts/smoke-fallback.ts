/**
 * フォールバック検証スモークテスト
 *
 * 無効な GEMINI_API_KEY で Gemini を呼び出し、rule-based へのフォールバックを検証する。
 * ESM モジュールキャッシュを避けるため、環境変数を先に設定してから動的 import する。
 *
 * 使用方法:
 *   npm run smoke:fallback
 */

import { createChecker, fetchJson } from './lib/smoke-helpers.js';

async function main() {
  // --- 環境変数を動的 import 前にセット ---
  process.env.REVIEW_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'invalid-key-for-smoke-test';

  // 動的 import で config がこの env を読む
  const { serve } = await import('@hono/node-server');
  const { app } = await import('../src/app.js');

  const { check, summary } = createChecker();
  let closeServer: (() => Promise<void>) | undefined;

  try {
    // --- サーバー起動（OS 割当ポート）---
    const started = await new Promise<{
      baseUrl: string;
      close: () => Promise<void>;
    }>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, (info) => {
        const baseUrl = `http://localhost:${info.port}`;
        const close = () =>
          new Promise<void>((res, rej) => {
            s.close((err) => (err ? rej(err) : res()));
          });
        resolve({ baseUrl, close });
      });
    });

    closeServer = started.close;
    const { baseUrl } = started;

    console.log(`\n=== Fallback Smoke Test (${baseUrl}) ===\n`);

    // --- Review execution with invalid key ---
    console.log('[Step 1] POST /api/review/run (dryRun, source=file) with invalid key');
    const review = await fetchJson(`${baseUrl}/api/review/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/smoke/sample-requirements.md',
        dryRun: true,
      }),
      timeoutMs: 60_000,
    });

    check('review returns 200', review.status === 200);
    check(
      'fallbackUsed === true',
      review.body?.metadata?.reviewProvider?.fallbackUsed === true,
      `got: ${review.body?.metadata?.reviewProvider?.fallbackUsed}`,
    );
    check(
      'effectiveProvider === "rule-based"',
      review.body?.metadata?.reviewProvider?.effectiveProvider === 'rule-based',
      `got: ${review.body?.metadata?.reviewProvider?.effectiveProvider}`,
    );
    check(
      'fallbackReason is not empty',
      Boolean(review.body?.metadata?.reviewProvider?.fallbackReason),
      `got: ${review.body?.metadata?.reviewProvider?.fallbackReason}`,
    );

    // --- Summary & cleanup ---
    const { ok } = summary();
    await closeServer();
    closeServer = undefined;
    process.exitCode = ok ? 0 : 1;
  } finally {
    if (closeServer) {
      await closeServer().catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exitCode = 1;
});
