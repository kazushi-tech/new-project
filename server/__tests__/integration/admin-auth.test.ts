import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mutable mock env - reset in beforeEach to prevent test pollution
const mockEnv = vi.hoisted(() => ({
  githubToken: '',
  githubOwner: 'test',
  githubRepo: 'test',
  githubWebhookSecret: '',
  port: 3000,
  nodeEnv: 'development',
  adminUiToken: 'test-admin-token',
}));

vi.mock('../../src/config.js', () => ({
  env: mockEnv,
  PROJECT_ROOT: process.cwd(),
}));

import { verifyAdminToken } from '../../src/middleware/verify-admin-token.js';

describe('verifyAdminToken middleware', () => {
  let app: Hono;

  beforeEach(() => {
    mockEnv.adminUiToken = 'test-admin-token';
    mockEnv.nodeEnv = 'development';

    app = new Hono();
    app.get('/protected', verifyAdminToken, (c) => {
      return c.json({ status: 'ok' });
    });
  });

  it('allows access with valid token', async () => {
    const res = await app.request('/protected', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('returns 401 with invalid token', async () => {
    const res = await app.request('/protected', {
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when x-admin-token header is missing', async () => {
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('allows access in dev mode when token is not configured', async () => {
    mockEnv.adminUiToken = '';
    mockEnv.nodeEnv = 'development';

    const res = await app.request('/protected');
    expect(res.status).toBe(200);
  });

  it('returns 503 in production when token is not configured', async () => {
    mockEnv.adminUiToken = '';
    mockEnv.nodeEnv = 'production';

    const res = await app.request('/protected');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Service unavailable');
  });

  it('sets Cache-Control: no-store on authenticated responses', async () => {
    const res = await app.request('/protected', {
      headers: { 'x-admin-token': 'test-admin-token' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not leak token details in error messages', async () => {
    const res = await app.request('/protected', {
      headers: { 'x-admin-token': 'wrong' },
    });
    const text = await res.text();
    expect(text).not.toContain('test-admin-token');
    expect(text).not.toContain('wrong');
  });
});
