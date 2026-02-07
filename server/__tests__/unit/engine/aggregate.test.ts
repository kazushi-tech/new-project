import { describe, it, expect } from 'vitest';
import { aggregateReviewResults } from '../../../src/engine/review-engine.js';
import type { ReviewResult } from '../../../src/types.js';

function makeResult(overrides: Partial<{
  path: string;
  findings: ReviewResult['findings'];
  qualityScore: number;
  prNumber: number;
}>): ReviewResult {
  const findings = overrides.findings ?? [];
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    bySeverity[f.severity]++;
  }

  return {
    metadata: {
      reviewId: 'rev-test',
      timestamp: new Date().toISOString(),
      source: {
        type: 'pr',
        path: overrides.path ?? 'requirements/test.md',
        prNumber: overrides.prNumber ?? 1,
      },
      rulesApplied: ['missing-id', 'ambiguous-word'],
    },
    summary: {
      totalFindings: findings.length,
      bySeverity,
      qualityScore: overrides.qualityScore ?? 10,
    },
    findings,
  };
}

describe('aggregateReviewResults', () => {
  it('should return single result as-is', () => {
    const single = makeResult({ path: 'requirements/a.md', qualityScore: 8 });
    const result = aggregateReviewResults([single]);
    expect(result).toBe(single);
  });

  it('should merge findings from multiple results', () => {
    const r1 = makeResult({
      path: 'requirements/a.md',
      findings: [
        { id: 'FIND-001', rule: 'missing-id', severity: 'high', category: 'consistency', message: 'msg1', suggestion: 'sug1' },
      ],
    });
    const r2 = makeResult({
      path: 'requirements/b.md',
      findings: [
        { id: 'FIND-001', rule: 'ambiguous-word', severity: 'medium', category: 'clarity', message: 'msg2', suggestion: 'sug2' },
        { id: 'FIND-002', rule: 'missing-id', severity: 'high', category: 'consistency', message: 'msg3', suggestion: 'sug3' },
      ],
    });

    const result = aggregateReviewResults([r1, r2]);

    expect(result.summary.totalFindings).toBe(3);
    expect(result.summary.fileCount).toBe(2);
    expect(result.findings).toHaveLength(3);
    // IDs should be re-assigned sequentially
    expect(result.findings[0].id).toBe('FIND-001');
    expect(result.findings[1].id).toBe('FIND-002');
    expect(result.findings[2].id).toBe('FIND-003');
  });

  it('should include per-file summaries', () => {
    const r1 = makeResult({ path: 'requirements/a.md', qualityScore: 9 });
    const r2 = makeResult({ path: 'requirements/b.md', qualityScore: 6 });

    const result = aggregateReviewResults([r1, r2]);

    expect(result.fileResults).toHaveLength(2);
    expect(result.fileResults![0].path).toBe('requirements/a.md');
    expect(result.fileResults![0].qualityScore).toBe(9);
    expect(result.fileResults![1].path).toBe('requirements/b.md');
    expect(result.fileResults![1].qualityScore).toBe(6);
  });

  it('should recalculate quality score from all findings', () => {
    const r1 = makeResult({
      path: 'requirements/a.md',
      findings: [
        { id: '', rule: 'r', severity: 'critical', category: 'completeness', message: 'm', suggestion: 's' },
      ],
    });
    const r2 = makeResult({
      path: 'requirements/b.md',
      findings: [
        { id: '', rule: 'r', severity: 'high', category: 'completeness', message: 'm', suggestion: 's' },
      ],
    });

    const result = aggregateReviewResults([r1, r2]);

    // critical=2, high=1.5 → 10 - 3.5 = 6.5
    expect(result.summary.qualityScore).toBe(6.5);
    expect(result.summary.bySeverity.critical).toBe(1);
    expect(result.summary.bySeverity.high).toBe(1);
  });

  it('should track multiple file paths in metadata', () => {
    const r1 = makeResult({ path: 'requirements/a.md' });
    const r2 = makeResult({ path: 'requirements/b.md' });

    const result = aggregateReviewResults([r1, r2]);

    expect(result.metadata.source.paths).toEqual(['requirements/a.md', 'requirements/b.md']);
  });

  it('should throw on empty array', () => {
    expect(() => aggregateReviewResults([])).toThrow('No review results to aggregate');
  });
});
