import { getOctokit, getRepoParams } from './client.js';
import type { ReviewResult } from '../types.js';

const CHECK_NAME = 'specforge-review-check';

export interface CheckRunOptions {
  headSha: string;
  result?: ReviewResult;
  conclusion: 'failure' | 'neutral';
  title?: string;
}

/**
 * 品質スコアに基づいてconclusion決定
 * AIは success にしない（人間承認必須の原則）
 */
export function determineConclusion(result: ReviewResult): 'failure' | 'neutral' {
  const { qualityScore, bySeverity } = result.summary;

  if (bySeverity.critical > 0) return 'failure';
  if (qualityScore < 5) return 'failure';
  if (bySeverity.high >= 3) return 'failure';

  return 'neutral';
}

/**
 * GitHub Checks APIでReview結果を報告
 */
export async function createCheckRun(opts: CheckRunOptions) {
  const octokit = getOctokit();
  const repo = getRepoParams();

  const { headSha, result, conclusion, title } = opts;

  const summary = result
    ? buildSummary(result)
    : title ?? 'No review performed';

  const outputTitle = result
    ? `Review ${conclusion}: Score ${result.summary.qualityScore}/10`
    : title ?? `Review ${conclusion}`;

  const { data: check } = await octokit.checks.create({
    ...repo,
    name: CHECK_NAME,
    head_sha: headSha,
    status: 'completed',
    conclusion,
    output: {
      title: outputTitle,
      summary,
      text: result ? buildDetailsText(result) : undefined,
    },
  });

  return check;
}

function buildSummary(result: ReviewResult): string {
  const lines = [
    `**Quality Score**: ${result.summary.qualityScore}/10`,
    `**Total Findings**: ${result.summary.totalFindings}`,
    `**Files Reviewed**: ${result.summary.fileCount ?? 1}`,
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| Critical | ${result.summary.bySeverity.critical} |`,
    `| High | ${result.summary.bySeverity.high} |`,
    `| Medium | ${result.summary.bySeverity.medium} |`,
    `| Low | ${result.summary.bySeverity.low} |`,
  ];
  return lines.join('\n');
}

function buildDetailsText(result: ReviewResult): string {
  const lines: string[] = [];

  if (result.fileResults && result.fileResults.length > 1) {
    lines.push('## Files Reviewed\n');
    for (const f of result.fileResults) {
      lines.push(`- \`${f.path}\`: ${f.findingCount} findings (score: ${f.qualityScore}/10)`);
    }
    lines.push('');
  }

  lines.push('## Findings\n');
  const topFindings = result.findings.slice(0, 20);
  for (const f of topFindings) {
    const target = f.target ? ` (${f.target})` : '';
    lines.push(`- **${f.severity.toUpperCase()}**: ${f.message}${target}`);
    lines.push(`  - ${f.suggestion}`);
  }

  if (result.findings.length > 20) {
    lines.push(`\n... and ${result.findings.length - 20} more findings (see PR comment for full details)`);
  }

  return lines.join('\n');
}

export { CHECK_NAME };
