import { timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { env } from '../config.js';

/**
 * Admin UI/API トークン検証ミドルウェア
 * - dev + TOKEN未設定: 警告ログ出して許可
 * - production + TOKEN未設定: 503
 * - TOKEN設定済 + ヘッダー不正/欠落: 401
 */
export async function verifyAdminToken(c: Context, next: Next) {
  if (!env.adminUiToken) {
    if (env.nodeEnv === 'production') {
      return c.json({ error: 'Service unavailable' }, 503);
    }
    console.warn('[WARN] ADMIN_UI_TOKEN not set - allowing access (dev mode only)');
    return next();
  }

  const token = c.req.header('x-admin-token');
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(env.adminUiToken);
  if (tokenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(tokenBuf, expectedBuf)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.header('Cache-Control', 'no-store');

  await next();
}
