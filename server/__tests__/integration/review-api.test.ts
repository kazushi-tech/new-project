import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock gemini adapter to prevent real API calls
vi.mock('../../src/ai/gemini-adapter.js', () => ({
  runGeminiReview: vi.fn(),
}));

// Mock config with mutable env
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

import { app } from '../../src/app.js';

beforeEach(() => {
  mockEnv.geminiApiKey = '';
  mockEnv.reviewProviderRaw = 'auto';
});

describe('POST /api/review/run - backward compatibility', () => {
  it('returns required keys for source=file dryRun', async () => {
    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/smoke/sample-requirements.md',
        dryRun: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Existing keys must be present
    expect(body.reviewId).toBeDefined();
    expect(typeof body.reviewId).toBe('string');
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.totalFindings).toBe('number');
    expect(body.summary.bySeverity).toBeDefined();
    expect(typeof body.summary.qualityScore).toBe('number');
    expect(body.findings).toBeDefined();
    expect(Array.isArray(body.findings)).toBe(true);
    expect(body.markdownPreview).toBeDefined();
    expect(typeof body.markdownPreview).toBe('string');

    // New metadata.reviewProvider must be present
    expect(body.metadata).toBeDefined();
    expect(body.metadata.reviewProvider).toBeDefined();
    expect(body.metadata.reviewProvider.configuredProvider).toBeDefined();
    expect(body.metadata.reviewProvider.effectiveProvider).toBeDefined();
    expect(typeof body.metadata.reviewProvider.fallbackUsed).toBe('boolean');
  });

  it('returns required keys for source=file non-dryRun', async () => {
    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/smoke/sample-requirements.md',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Existing keys
    expect(body.reviewId).toBeDefined();
    expect(body.summary).toBeDefined();
    expect(body.findings).toBeDefined();
    expect(body.report).toBeDefined();

    // New metadata.reviewProvider
    expect(body.metadata).toBeDefined();
    expect(body.metadata.reviewProvider).toBeDefined();
    expect(body.metadata.reviewProvider.effectiveProvider).toBe('rule-based');
    expect(body.metadata.reviewProvider.fallbackUsed).toBe(false);
  });

  it('returns rule-based provider when no Gemini key is configured', async () => {
    mockEnv.geminiApiKey = '';
    mockEnv.reviewProviderRaw = 'auto';

    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/smoke/sample-requirements.md',
        dryRun: true,
      }),
    });

    const body = await res.json();
    expect(body.metadata.reviewProvider.configuredProvider).toBe('rule-based');
    expect(body.metadata.reviewProvider.effectiveProvider).toBe('rule-based');
    expect(body.metadata.reviewProvider.fallbackUsed).toBe(false);
  });

  it('preserves error responses for invalid requests', async () => {
    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'file' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('preserves error for invalid source', async () => {
    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'invalid' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
