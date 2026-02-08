import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the gemini-client module
const mockCallGemini = vi.fn();
vi.mock('../../../src/ai/gemini-client.js', () => ({
  callGemini: (...args: any[]) => mockCallGemini(...args),
}));

import { runGeminiReview } from '../../../src/ai/gemini-adapter.js';
import { GeminiError } from '../../../src/ai/types.js';

beforeEach(() => {
  mockCallGemini.mockReset();
});

describe('runGeminiReview', () => {
  it('parses valid JSON response from Gemini', async () => {
    const findings = [
      {
        rule: 'ai-review',
        severity: 'high',
        category: 'completeness',
        target: 'FR-001',
        message: '要件が不完全',
        suggestion: '[AI提案] 詳細を追加してください',
      },
    ];
    mockCallGemini.mockResolvedValueOnce(`Some text\n\`\`\`json\n${JSON.stringify(findings)}\n\`\`\``);

    const result = await runGeminiReview('test-key', { content: '# Test' });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].rule).toBe('ai-review');
    expect(result.findings[0].severity).toBe('high');
    expect(result.findings[0].id).toBe('AI-001');
    expect(result.findings[0].suggestion).toContain('[AI提案]');
  });

  it('handles empty findings array', async () => {
    mockCallGemini.mockResolvedValueOnce('[]');

    const result = await runGeminiReview('test-key', { content: '# Test' });
    expect(result.findings).toHaveLength(0);
  });

  it('sanitizes invalid severity to medium', async () => {
    const findings = [
      {
        rule: 'ai-review',
        severity: 'invalid-severity',
        category: 'completeness',
        message: 'test',
        suggestion: 'fix it',
      },
    ];
    mockCallGemini.mockResolvedValueOnce(JSON.stringify(findings));

    const result = await runGeminiReview('test-key', { content: '# Test' });
    expect(result.findings[0].severity).toBe('medium');
  });

  it('sanitizes invalid category to completeness', async () => {
    const findings = [
      {
        rule: 'ai-review',
        severity: 'high',
        category: 'invalid-category',
        message: 'test',
        suggestion: 'fix it',
      },
    ];
    mockCallGemini.mockResolvedValueOnce(JSON.stringify(findings));

    const result = await runGeminiReview('test-key', { content: '# Test' });
    expect(result.findings[0].category).toBe('completeness');
  });

  it('adds [AI提案] prefix to suggestions missing it', async () => {
    const findings = [
      {
        rule: 'ai-review',
        severity: 'medium',
        category: 'clarity',
        message: 'Ambiguous',
        suggestion: 'Be more specific',
      },
    ];
    mockCallGemini.mockResolvedValueOnce(JSON.stringify(findings));

    const result = await runGeminiReview('test-key', { content: '# Test' });
    expect(result.findings[0].suggestion).toBe('[AI提案] Be more specific');
  });

  it('preserves [AI提案] prefix when already present', async () => {
    const findings = [
      {
        rule: 'ai-review',
        severity: 'medium',
        category: 'clarity',
        message: 'Ambiguous',
        suggestion: '[AI提案] Be more specific',
      },
    ];
    mockCallGemini.mockResolvedValueOnce(JSON.stringify(findings));

    const result = await runGeminiReview('test-key', { content: '# Test' });
    expect(result.findings[0].suggestion).toBe('[AI提案] Be more specific');
  });

  it('throws GeminiError when no JSON array found in response', async () => {
    mockCallGemini.mockResolvedValueOnce('No JSON here');

    await expect(runGeminiReview('test-key', { content: '# Test' })).rejects.toThrow(GeminiError);
  });

  it('propagates GeminiError from client', async () => {
    mockCallGemini.mockRejectedValueOnce(
      new GeminiError('Rate limited', 'rate_limit', 429)
    );

    await expect(runGeminiReview('test-key', { content: '# Test' })).rejects.toThrow(GeminiError);
  });
});
