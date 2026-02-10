import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';

const mockEnv = vi.hoisted(() => ({
  githubWebhookSecret: 'test-secret-key',
  nodeEnv: 'development',
}));

vi.mock('../../../src/config.js', () => ({
  env: mockEnv,
}));

import { verifyGithubSignature } from '../../../src/middleware/verify-github-signature.js';

function signPayload(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

describe('verifyGithubSignature', () => {
  let app: Hono;

  beforeEach(() => {
    mockEnv.githubWebhookSecret = 'test-secret-key';
    mockEnv.nodeEnv = 'development';
    app = new Hono();
    app.post('/webhook', verifyGithubSignature, (c) => {
      const payload = c.get('webhookPayload');
      return c.json({ status: 'ok', payload });
    });
  });

  it('should accept valid signature', async () => {
    const payload = JSON.stringify({ test: 'data' });
    const signature = signPayload(payload, 'test-secret-key');

    const res = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body: payload,
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.payload).toEqual({ test: 'data' });
  });

  it('should reject invalid signature', async () => {
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=invalid',
      },
      body: JSON.stringify({ test: 'data' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid signature');
  });

  it('should reject missing signature header', async () => {
    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Missing');
  });

  it('should skip verification in dev mode when secret is empty', async () => {
    mockEnv.githubWebhookSecret = '';
    mockEnv.nodeEnv = 'development';

    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });

    expect(res.status).toBe(200);
  });

  it('should return 401 in production when secret is empty', async () => {
    mockEnv.githubWebhookSecret = '';
    mockEnv.nodeEnv = 'production';

    const res = await app.request('/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('not configured');
  });
});
