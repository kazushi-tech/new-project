import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';

// Mock GitHub modules
vi.mock('../../src/github/client.js', () => ({
  getOctokit: vi.fn(() => ({
    pulls: {
      listFiles: vi.fn().mockResolvedValue({
        data: [
          { filename: 'requirements/test.md', status: 'modified', additions: 10, deletions: 2 },
        ],
      }),
      get: vi.fn().mockResolvedValue({ data: {} }),
    },
    repos: {
      getContent: vi.fn().mockResolvedValue({
        data: {
          content: Buffer.from(`
## 機能要件

### FR-001: テスト機能

- **優先度**: must
- **説明**: テスト
- **受入条件**:
  - [ ] テストできること
`).toString('base64'),
        },
      }),
    },
    issues: {
      listComments: vi.fn().mockResolvedValue({ data: [] }),
      createComment: vi.fn().mockResolvedValue({ data: { id: 100 } }),
    },
  })),
  getRepoParams: vi.fn(() => ({ owner: 'kazushi-tech', repo: 'new-project' })),
}));

vi.mock('../../src/config.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/config.js')>();
  return {
    ...mod,
    env: {
      ...mod.env,
      githubToken: 'test-token',
    },
  };
});

describe('Webhook Integration Flow', () => {
  it('should process pull_request event and return review result', async () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 42,
        head: { sha: 'abc1234' },
      },
    };

    const res = await app.request('/api/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe('processed');
    expect(json.reviewId).toMatch(/^rev-/);
    expect(json.summary).toBeDefined();
    expect(json.summary.totalFindings).toBeGreaterThanOrEqual(0);
  });

  it('should skip non-pull_request events', async () => {
    const res = await app.request('/api/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'push',
      },
      body: JSON.stringify({}),
    });

    const json = await res.json();
    expect(json.status).toBe('skipped');
  });

  it('should skip unsupported PR actions', async () => {
    const res = await app.request('/api/webhooks/github', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
      },
      body: JSON.stringify({ action: 'closed', pull_request: { number: 1 } }),
    });

    const json = await res.json();
    expect(json.status).toBe('skipped');
  });

  it('should return health check', async () => {
    const res = await app.request('/health');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.version).toBe('0.1.0');
  });

  it('should review from file via API', async () => {
    const res = await app.request('/api/review/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'file',
        filePath: 'requirements/requirements-draft.md',
        dryRun: true,
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reviewId).toMatch(/^rev-/);
    expect(json.findings.length).toBeGreaterThan(0);
    expect(json.markdownPreview).toContain('<!-- specforge-review -->');
  });
});
