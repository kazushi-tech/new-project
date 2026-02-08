import { describe, it, expect, vi } from 'vitest';

// Mock the gemini adapter to prevent real API calls
vi.mock('../../../src/ai/gemini-adapter.js', () => ({
  runGeminiReview: vi.fn(),
}));

import { runReview } from '../../../src/engine/review-engine.js';
import path from 'node:path';

const SAMPLE_FILE = path.resolve('requirements/requirements-draft.md');

describe('runReview', () => {
  it('should return review result with findings from sample file', async () => {
    const result = await runReview({ source: 'file', filePath: SAMPLE_FILE });

    expect(result.metadata.reviewId).toMatch(/^rev-/);
    expect(result.metadata.source.type).toBe('file');
    expect(result.summary.totalFindings).toBeGreaterThan(0);
    expect(result.summary.qualityScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.qualityScore).toBeLessThanOrEqual(10);
  });

  it('should assign FIND-XXX IDs to all findings', async () => {
    const result = await runReview({ source: 'file', filePath: SAMPLE_FILE });

    for (const finding of result.findings) {
      expect(finding.id).toMatch(/^FIND-\d{3}$/);
    }
  });

  it('should include all rules in rulesApplied', async () => {
    const result = await runReview({ source: 'file', filePath: SAMPLE_FILE });

    expect(result.metadata.rulesApplied).toContain('missing-id');
    expect(result.metadata.rulesApplied).toContain('missing-acceptance');
    expect(result.metadata.rulesApplied).toContain('ambiguous-word');
    expect(result.metadata.rulesApplied).toContain('missing-nfr');
  });

  it('should detect ambiguous word "適切な" in sample', async () => {
    const result = await runReview({ source: 'file', filePath: SAMPLE_FILE });

    const ambiguousFinding = result.findings.find(
      f => f.rule === 'ambiguous-word' && f.message.includes('適切')
    );
    expect(ambiguousFinding).toBeDefined();
    expect(ambiguousFinding!.target).toBe('FR-005');
  });

  it('should review from content string', async () => {
    const content = `
## 機能要件

### FR-001: テスト

- **優先度**: must
- できるだけ速く
`;
    const result = await runReview({ source: 'file', content });

    expect(result.summary.totalFindings).toBeGreaterThan(0);
  });

  it('should throw when no content or filePath provided', async () => {
    await expect(runReview({ source: 'file' })).rejects.toThrow('Either filePath or content must be provided');
  });

  it('should include reviewProvider metadata', async () => {
    const result = await runReview({ source: 'file', filePath: SAMPLE_FILE });

    expect(result.metadata.reviewProvider).toBeDefined();
    expect(result.metadata.reviewProvider!.configuredProvider).toBeDefined();
    expect(result.metadata.reviewProvider!.effectiveProvider).toBeDefined();
    expect(typeof result.metadata.reviewProvider!.fallbackUsed).toBe('boolean');
  });
});
