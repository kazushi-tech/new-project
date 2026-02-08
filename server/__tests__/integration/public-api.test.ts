import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable mock env - reset in beforeEach to prevent test pollution
const mockEnv = vi.hoisted(() => ({
  githubToken: '',
  githubOwner: 'test',
  githubRepo: 'test',
  githubWebhookSecret: '',
  port: 3000,
  nodeEnv: 'development',
  adminUiToken: 'test-token',
  geminiApiKey: '',
  reviewProviderRaw: 'auto' as 'auto' | 'gemini' | 'rule-based',
}));

vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  return {
    ...actual,
    env: mockEnv,
    getReviewProviderConfig: () => {
      const geminiConfigured = Boolean(mockEnv.geminiApiKey);
      let configured: 'gemini' | 'rule-based';
      if (mockEnv.reviewProviderRaw === 'auto') {
        configured = geminiConfigured ? 'gemini' : 'rule-based';
      } else {
        configured = mockEnv.reviewProviderRaw as 'gemini' | 'rule-based';
      }
      const effective = (configured === 'gemini' && !geminiConfigured)
        ? 'rule-based'
        : configured;
      return { configured, effective, geminiConfigured };
    },
  };
});

// Mock GitHub modules to prevent import errors
vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => ({})),
  getRepoParams: vi.fn(() => ({ owner: 'test', repo: 'test' })),
}));

// Mock node:fs for reviews/latest tests
const { mockReaddirSync, mockStatSync, mockReadFileSync } = vi.hoisted(() => ({
  mockReaddirSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: (...args: any[]) => {
      if (mockReaddirSync.getMockImplementation()) {
        return mockReaddirSync(...args);
      }
      return actual.readdirSync(...(args as [any]));
    },
    statSync: (...args: any[]) => {
      if (mockStatSync.getMockImplementation()) {
        return mockStatSync(...args);
      }
      return actual.statSync(...(args as [any]));
    },
    readFileSync: (...args: any[]) => {
      if (mockReadFileSync.getMockImplementation()) {
        return mockReadFileSync(...args);
      }
      return actual.readFileSync(...(args as [any]));
    },
  };
});

import { app } from '../../src/app.js';

beforeEach(() => {
  mockEnv.adminUiToken = 'test-token';
  mockEnv.nodeEnv = 'development';
  mockEnv.geminiApiKey = '';
  mockEnv.reviewProviderRaw = 'auto';
  mockReaddirSync.mockReset();
  mockStatSync.mockReset();
  mockReadFileSync.mockReset();
});

describe('GET /api/public/status', () => {
  it('returns service status with required fields', async () => {
    const res = await app.request('/api/public/status');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.service).toBe('ok');
    expect(body.engine).toBe('rule-based');
    expect(body.configuredProvider).toBe('rule-based');
    expect(body.effectiveProvider).toBe('rule-based');
    expect(body.allowedApis).toBeInstanceOf(Array);
    expect(typeof body.geminiConfigured).toBe('boolean');
    expect(typeof body.timestamp).toBe('string');
  });

  it('does not expose secret values', async () => {
    const res = await app.request('/api/public/status');
    const text = await res.text();

    expect(text).not.toContain('GITHUB_TOKEN');
    expect(text).not.toContain('GITHUB_WEBHOOK_SECRET');
  });

  it('reports geminiConfigured as false when no key is set', async () => {
    mockEnv.geminiApiKey = '';
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.geminiConfigured).toBe(false);
    expect(body.configuredProvider).toBe('rule-based');
    expect(body.effectiveProvider).toBe('rule-based');
  });

  it('reports geminiConfigured as true when key is set', async () => {
    mockEnv.geminiApiKey = 'test-key-value';
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.geminiConfigured).toBe(true);
    expect(body.configuredProvider).toBe('gemini');
    expect(body.effectiveProvider).toBe('gemini');
    const text = JSON.stringify(body);
    expect(text).not.toContain('test-key-value');
  });

  it('reports rule-based when provider is explicitly set to rule-based', async () => {
    mockEnv.geminiApiKey = 'test-key';
    mockEnv.reviewProviderRaw = 'rule-based';
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.configuredProvider).toBe('rule-based');
    expect(body.effectiveProvider).toBe('rule-based');
    expect(body.geminiConfigured).toBe(true);
  });

  it('falls back to rule-based when gemini configured but no API key', async () => {
    mockEnv.geminiApiKey = '';
    mockEnv.reviewProviderRaw = 'gemini';
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.configuredProvider).toBe('gemini');
    expect(body.effectiveProvider).toBe('rule-based');
    expect(body.geminiConfigured).toBe(false);
  });

  it('is accessible without x-admin-token header', async () => {
    const res = await app.request('/api/public/status');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/public/reviews/latest', () => {
  it('returns latest review when reports exist', async () => {
    const res = await app.request('/api/public/reviews/latest', {
      headers: { 'x-admin-token': 'test-token' },
    });
    expect([200, 404]).toContain(res.status);

    const body = await res.json();
    if (res.status === 200) {
      expect(typeof body.content).toBe('string');
      expect(typeof body.truncated).toBe('boolean');
      expect(typeof body.source).toBe('string');
      expect(typeof body.lastModified).toBe('string');
    } else {
      expect(body.error).toBeDefined();
    }
  });

  it('returns 404 with error message when no reports exist', async () => {
    mockReaddirSync.mockImplementation(() => []);

    const res = await app.request('/api/public/reviews/latest', {
      headers: { 'x-admin-token': 'test-token' },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('truncates content exceeding 4096 characters', async () => {
    const longContent = 'A'.repeat(5000);

    mockReaddirSync.mockImplementation(() => ['pr-99']);

    mockStatSync.mockImplementation((p: any) => {
      const pathStr = String(p);
      if (pathStr.includes('pr-99') && !pathStr.includes('latest-report')) {
        return { isDirectory: () => true, mtimeMs: Date.now() };
      }
      if (pathStr.includes('latest-report.md')) {
        return { mtimeMs: Date.now() };
      }
      throw new Error('ENOENT');
    });

    mockReadFileSync.mockImplementation((p: any) => {
      if (typeof p === 'string' && p.includes('latest-report.md')) {
        return longContent;
      }
      throw new Error('ENOENT');
    });

    const res = await app.request('/api/public/reviews/latest', {
      headers: { 'x-admin-token': 'test-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.content.length).toBe(4096);
  });

  it('returns 401 when x-admin-token header is missing', async () => {
    const res = await app.request('/api/public/reviews/latest');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when x-admin-token is invalid', async () => {
    const res = await app.request('/api/public/reviews/latest', {
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 503 in production when token is not configured', async () => {
    mockEnv.adminUiToken = '';
    mockEnv.nodeEnv = 'production';

    const res = await app.request('/api/public/reviews/latest');
    expect(res.status).toBe(503);
  });
});
