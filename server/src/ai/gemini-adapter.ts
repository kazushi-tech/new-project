import type { ReviewFinding, Severity, FindingCategory } from '../types.js';
import type { AiReviewRequest, AiReviewResponse } from './types.js';
import { GeminiError } from './types.js';
import { callGemini } from './gemini-client.js';
import { buildReviewPrompt } from './gemini-prompt.js';

const VALID_SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];
const VALID_CATEGORIES: FindingCategory[] = ['completeness', 'clarity', 'consistency', 'testability'];
const AI_PROPOSAL_PREFIX = '[AI提案]';

function extractJsonArray(text: string): unknown[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new GeminiError('No JSON array found in Gemini response', 'invalid_response');
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      throw new GeminiError('Gemini response is not an array', 'invalid_response');
    }
    return parsed;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(`Failed to parse Gemini JSON: ${(err as Error).message}`, 'invalid_response');
  }
}

function sanitizeFinding(raw: Record<string, unknown>, index: number): ReviewFinding {
  const severity = VALID_SEVERITIES.includes(raw.severity as Severity)
    ? (raw.severity as Severity)
    : 'medium';

  const category = VALID_CATEGORIES.includes(raw.category as FindingCategory)
    ? (raw.category as FindingCategory)
    : 'completeness';

  const suggestion = typeof raw.suggestion === 'string' ? raw.suggestion : '';
  const normalizedSuggestion = suggestion.startsWith(AI_PROPOSAL_PREFIX)
    ? suggestion
    : `${AI_PROPOSAL_PREFIX} ${suggestion}`;

  return {
    id: `AI-${String(index + 1).padStart(3, '0')}`,
    rule: typeof raw.rule === 'string' ? raw.rule : 'ai-review',
    severity,
    category,
    target: typeof raw.target === 'string' ? raw.target : undefined,
    message: typeof raw.message === 'string' ? raw.message : 'AI review finding',
    suggestion: normalizedSuggestion,
    line: typeof raw.line === 'number' ? raw.line : undefined,
  };
}

export async function runGeminiReview(
  apiKey: string,
  request: AiReviewRequest,
): Promise<AiReviewResponse> {
  const prompt = buildReviewPrompt(request.content, request.filePath);
  const responseText = await callGemini(apiKey, prompt);

  const rawFindings = extractJsonArray(responseText);
  const findings = rawFindings.map(
    (item, i) => sanitizeFinding(item as Record<string, unknown>, i),
  );

  return {
    findings,
    summary: `Gemini reviewed and found ${findings.length} issue(s)`,
  };
}
