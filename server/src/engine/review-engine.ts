import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReviewResult, ReviewFinding, Severity, FileReviewSummary } from '../types.js';
import { parseRequirementsMarkdown } from './markdown-parser.js';
import { runAllRules, getDefaultRules } from './rules/index.js';
import { PROJECT_ROOT, env, getReviewProviderConfig } from '../config.js';
import type { ReviewProviderType } from '../config.js';
import { runGeminiReview } from '../ai/gemini-adapter.js';
import { GeminiError } from '../ai/types.js';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 2,
  high: 1.5,
  medium: 0.5,
  low: 0.25,
};

function generateReviewId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `rev-${ts}`;
}

function assignFindingIds(findings: ReviewFinding[]): ReviewFinding[] {
  return findings.map((f, i) => ({
    ...f,
    id: `FIND-${String(i + 1).padStart(3, '0')}`,
  }));
}

function calculateQualityScore(findings: ReviewFinding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0), 0);
  return Math.max(0, Math.round((10 - penalty) * 10) / 10);
}

function countBySeverity(findings: ReviewFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}

export function aggregateReviewResults(results: ReviewResult[]): ReviewResult {
  if (results.length === 0) {
    throw new Error('No review results to aggregate');
  }

  if (results.length === 1) {
    return results[0];
  }

  const allFindings = assignFindingIds(results.flatMap(r => r.findings));

  const fileResults: FileReviewSummary[] = results.map(r => ({
    path: r.metadata.source.path ?? 'unknown',
    findingCount: r.findings.length,
    qualityScore: r.summary.qualityScore,
    bySeverity: r.summary.bySeverity,
  }));

  const paths = results.map(r => r.metadata.source.path).filter(Boolean) as string[];
  const prNumber = results[0].metadata.source.prNumber;

  return {
    metadata: {
      reviewId: generateReviewId(),
      timestamp: new Date().toISOString(),
      source: {
        type: 'pr',
        paths,
        prNumber,
      },
      rulesApplied: results[0].metadata.rulesApplied,
      reviewProvider: results[0].metadata.reviewProvider,
    },
    summary: {
      totalFindings: allFindings.length,
      bySeverity: countBySeverity(allFindings),
      qualityScore: calculateQualityScore(allFindings),
      fileCount: results.length,
    },
    findings: allFindings,
    fileResults,
  };
}

export interface ReviewOptions {
  source: 'file' | 'pr';
  filePath?: string;
  prNumber?: number;
  content?: string;
}

export interface ReviewMetadata {
  configuredProvider: ReviewProviderType;
  effectiveProvider: ReviewProviderType;
  fallbackUsed: boolean;
  fallbackReason?: string;
}

function runRuleBasedReview(content: string): { findings: ReviewFinding[]; rulesApplied: string[] } {
  const doc = parseRequirementsMarkdown(content);
  const rawFindings = runAllRules(doc, getDefaultRules());
  const findings = assignFindingIds(rawFindings);
  const rules = getDefaultRules();
  return { findings, rulesApplied: rules.map(r => r.id) };
}

export async function runReview(opts: ReviewOptions): Promise<ReviewResult> {
  let content: string;

  if (opts.content) {
    content = opts.content;
  } else if (opts.filePath) {
    const fullPath = path.isAbsolute(opts.filePath)
      ? opts.filePath
      : path.resolve(PROJECT_ROOT, opts.filePath);
    content = readFileSync(fullPath, 'utf-8');
  } else {
    throw new Error('Either filePath or content must be provided');
  }

  const providerConfig = getReviewProviderConfig();
  let effectiveProvider = providerConfig.effective;
  let fallbackUsed = false;
  let fallbackReason: string | undefined;
  let findings: ReviewFinding[];
  let rulesApplied: string[];

  if (effectiveProvider === 'gemini') {
    try {
      const aiResult = await runGeminiReview(env.geminiApiKey, {
        content,
        filePath: opts.filePath,
      });
      findings = aiResult.findings;
      rulesApplied = ['ai-review'];
    } catch (err) {
      const reason = err instanceof GeminiError
        ? `${err.category}: ${err.message}`
        : `unknown: ${(err as Error).message}`;
      console.error(`[review-engine] Gemini failed, falling back to rule-based: ${reason}`);
      fallbackUsed = true;
      fallbackReason = reason;
      effectiveProvider = 'rule-based';
      const ruleResult = runRuleBasedReview(content);
      findings = ruleResult.findings;
      rulesApplied = ruleResult.rulesApplied;
    }
  } else {
    const ruleResult = runRuleBasedReview(content);
    findings = ruleResult.findings;
    rulesApplied = ruleResult.rulesApplied;
  }

  const reviewProvider: ReviewMetadata = {
    configuredProvider: providerConfig.configured,
    effectiveProvider,
    fallbackUsed,
    fallbackReason,
  };

  return {
    metadata: {
      reviewId: generateReviewId(),
      timestamp: new Date().toISOString(),
      source: {
        type: opts.source,
        path: opts.filePath,
        prNumber: opts.prNumber,
      },
      rulesApplied,
      reviewProvider,
    },
    summary: {
      totalFindings: findings.length,
      bySeverity: countBySeverity(findings),
      qualityScore: calculateQualityScore(findings),
    },
    findings,
  };
}
