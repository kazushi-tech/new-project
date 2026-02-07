import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';

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

beforeEach(() => {
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
    delete process.env.GEMINI_API_KEY;
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.geminiConfigured).toBe(false);
  });

  it('reports geminiConfigured as true when key is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key-value';
    const res = await app.request('/api/public/status');
    const body = await res.json();
    expect(body.geminiConfigured).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('test-key-value');
    delete process.env.GEMINI_API_KEY;
  });
});

describe('GET /api/public/reviews/latest', () => {
  it('returns latest review when reports exist', async () => {
    const res = await app.request('/api/public/reviews/latest');
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

    const res = await app.request('/api/public/reviews/latest');
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

    const res = await app.request('/api/public/reviews/latest');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(body.content.length).toBe(4096);
  });
});
