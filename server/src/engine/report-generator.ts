import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ReviewResult, Severity } from '../types.js';
import { PROJECT_ROOT, specForgeConfig } from '../config.js';

function outputDir(prNumber?: number): string {
  const base = path.resolve(PROJECT_ROOT, 'reviews');
  if (prNumber) {
    return path.join(base, `pr-${prNumber}`);
  }
  return path.join(base, 'local');
}

export function saveReviewResult(result: ReviewResult): { jsonPath: string; markdownPath: string } {
  const dir = outputDir(result.metadata.source.prNumber);
  mkdirSync(dir, { recursive: true });

  const ts = result.metadata.timestamp.replace(/[-:T]/g, '').slice(0, 14);
  const jsonPath = path.join(dir, `review-${ts}.json`);
  const mdPath = path.join(dir, 'latest-report.md');

  writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  writeFileSync(mdPath, generateMarkdownReport(result), 'utf-8');

  return { jsonPath, markdownPath: mdPath };
}

export function generateMarkdownReport(result: ReviewResult): string {
  const { metadata, summary, findings, fileResults } = result;
  const marker = specForgeConfig.comment.marker;
  const prefix = specForgeConfig.guardrails.aiProposalPrefix;

  const lines: string[] = [
    marker,
    '## SpecForge Requirements Review',
    '',
    `> Reviewed: ${metadata.timestamp} | ReviewID: ${metadata.reviewId}`,
    '',
  ];

  // Per-file breakdown for multi-file reviews
  if (fileResults && fileResults.length > 1) {
    lines.push('### Files Reviewed');
    lines.push('');
    lines.push('| File | Findings | Score |');
    lines.push('|------|----------|-------|');
    for (const f of fileResults) {
      lines.push(`| \`${f.path}\` | ${f.findingCount} | ${f.qualityScore}/10 |`);
    }
    lines.push('');
  }

  const fileCountNote = summary.fileCount && summary.fileCount > 1 ? ` (${summary.fileCount} ファイルを集約)` : '';
  lines.push('### Quality Score');
  lines.push('');
  lines.push(`**総合スコア: ${summary.qualityScore} / 10**${fileCountNote}`);
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const s of ['critical', 'high', 'medium', 'low'] as Severity[]) {
    lines.push(`| ${s} | ${summary.bySeverity[s]} |`);
  }
  lines.push('');

  // Group findings by severity
  for (const sev of ['critical', 'high', 'medium', 'low'] as Severity[]) {
    const group = findings.filter(f => f.severity === sev);
    if (group.length === 0) continue;

    lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${group.length})`);
    lines.push('');

    for (const f of group) {
      const target = f.target ? ` (${f.target})` : '';
      const lineRef = f.line ? ` [行${f.line}]` : '';
      lines.push(`- **${f.id}**${target}${lineRef}: ${f.message}`);
      lines.push(`  - ${f.suggestion}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`> ${prefix} 項目は提案のみです。人間による承認が必要です。`);
  lines.push('> AIはこのPRをAPPROVEしません。');

  return lines.join('\n');
}
