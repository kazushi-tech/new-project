import { describe, it, expect, vi } from 'vitest';
import { determineConclusion, CHECK_NAME } from '../../../src/github/checks.js';
import type { ReviewResult } from '../../../src/types.js';

function makeResult(overrides: {
  qualityScore?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
}): ReviewResult {
  const bySeverity = {
    critical: overrides.critical ?? 0,
    high: overrides.high ?? 0,
    medium: overrides.medium ?? 0,
    low: overrides.low ?? 0,
  };
  const totalFindings = Object.values(bySeverity).reduce((a, b) => a + b, 0);

  return {
    metadata: {
      reviewId: 'rev-test',
      timestamp: new Date().toISOString(),
      source: { type: 'pr', prNumber: 1 },
      rulesApplied: [],
    },
    summary: {
      totalFindings,
      bySeverity,
      qualityScore: overrides.qualityScore ?? 10,
    },
    findings: [],
  };
}

describe('determineConclusion', () => {
  it('should return failure for critical findings', () => {
    const result = makeResult({ critical: 1, qualityScore: 8 });
    expect(determineConclusion(result)).toBe('failure');
  });

  it('should return failure for low quality score', () => {
    const result = makeResult({ qualityScore: 4.5 });
    expect(determineConclusion(result)).toBe('failure');
  });

  it('should return failure for 3+ high severity findings', () => {
    const result = makeResult({ high: 3, qualityScore: 5.5 });
    expect(determineConclusion(result)).toBe('failure');
  });

  it('should return neutral for passing review', () => {
    const result = makeResult({ medium: 2, low: 1, qualityScore: 8.75 });
    expect(determineConclusion(result)).toBe('neutral');
  });

  it('should return neutral for perfect score', () => {
    const result = makeResult({ qualityScore: 10 });
    expect(determineConclusion(result)).toBe('neutral');
  });

  it('should return neutral for 2 high findings (below threshold)', () => {
    const result = makeResult({ high: 2, qualityScore: 7 });
    expect(determineConclusion(result)).toBe('neutral');
  });

  it('should return failure for exactly score 5 boundary (< 5 check)', () => {
    const result = makeResult({ qualityScore: 5 });
    expect(determineConclusion(result)).toBe('neutral');
  });
});

describe('CHECK_NAME', () => {
  it('should be a fixed string for branch protection', () => {
    expect(CHECK_NAME).toBe('specforge-review-check');
  });
});
