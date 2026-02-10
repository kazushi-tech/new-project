import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';
import { env } from '../config.js';

/**
 * GitHub Webhook HMAC署名検証ミドルウェア
 * https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export async function verifyGithubSignature(c: Context, next: Next) {
  if (!env.githubWebhookSecret) {
    if (env.nodeEnv === 'production') {
      return c.json({ error: 'Webhook secret not configured' }, 401);
    }
    console.warn('[WARN] GITHUB_WEBHOOK_SECRET not set - skipping verification (dev mode only)');
    return next();
  }

  const signature = c.req.header('x-hub-signature-256');
  if (!signature) {
    return c.json({ error: 'Missing x-hub-signature-256 header' }, 401);
  }

  const rawBody = await c.req.text();

  const hmac = createHmac('sha256', env.githubWebhookSecret);
  hmac.update(rawBody, 'utf8');
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Store parsed payload for downstream handlers (Hono can only read body once)
  c.set('webhookPayload' as never, JSON.parse(rawBody));

  await next();
}
