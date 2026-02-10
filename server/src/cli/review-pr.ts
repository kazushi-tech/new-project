import { runReview, aggregateReviewResults } from '../engine/review-engine.js';
import { saveReviewResult, generateMarkdownReport } from '../engine/report-generator.js';
import { fetchPrRequirementsFiles } from '../github/pr-files.js';
import { upsertReviewComment } from '../github/comment.js';
import { createCheckRun, determineConclusion } from '../github/checks.js';

function parseArgs(args: string[]): { pr?: number; dryRun: boolean } {
  let pr: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pr' && args[i + 1]) {
      pr = Number(args[++i]);
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { pr, dryRun };
}

async function main() {
  const { pr, dryRun } = parseArgs(process.argv.slice(2));

  if (!pr) {
    console.error('Usage: npm run review:pr -- --pr <number> [--dry-run]');
    process.exit(1);
  }

  console.log(`\nReviewing PR #${pr}`);
  console.log(`Dry-run: ${dryRun}\n`);

  // Fetch changed requirements files from PR
  const files = await fetchPrRequirementsFiles(pr);

  if (files.length === 0) {
    console.log('No requirements files changed in this PR.');
    const headSha = process.env.GITHUB_SHA;
    if (headSha && !dryRun) {
      console.log('Creating neutral Check Run (no requirements files)...');
      await createCheckRun({ headSha, conclusion: 'neutral', title: 'No requirements files changed' });
      console.log('Done.');
    }
    return;
  }

  console.log(`Found ${files.length} requirements file(s):`);
  for (const f of files) {
    console.log(`  - ${f.filename}`);
  }
  console.log('');

  // Review each file and aggregate results
  const allResults = [];
  for (const file of files) {
    if (!file.content) {
      console.log(`  Skipping ${file.filename} (no content available)`);
      continue;
    }
    const result = await runReview({
      source: 'pr',
      filePath: file.filename,
      prNumber: pr,
      content: file.content,
    });
    allResults.push(result);
  }

  if (allResults.length === 0) {
    console.log('No reviewable content found.');
    const headSha = process.env.GITHUB_SHA;
    if (headSha && !dryRun) {
      await createCheckRun({ headSha, conclusion: 'neutral', title: 'No reviewable content found' });
    }
    return;
  }

  // Aggregate all results
  const result = aggregateReviewResults(allResults);

  console.log('=== Review Summary ===');
  console.log(`Review ID: ${result.metadata.reviewId}`);
  console.log(`Files reviewed: ${result.summary.fileCount ?? 1}`);
  console.log(`Total findings: ${result.summary.totalFindings}`);
  console.log(`Quality score: ${result.summary.qualityScore}/10`);
  console.log(`Severity breakdown:`, result.summary.bySeverity);
  console.log('');

  if (result.fileResults && result.fileResults.length > 1) {
    console.log('=== Per-File Summary ===');
    for (const fr of result.fileResults) {
      console.log(`  ${fr.path}: ${fr.findingCount} findings (score: ${fr.qualityScore}/10)`);
    }
    console.log('');
  }

  for (const f of result.findings) {
    const target = f.target ? ` (${f.target})` : '';
    const line = f.line ? ` [line ${f.line}]` : '';
    console.log(`  ${f.id} [${f.severity}]${target}${line}: ${f.message}`);
    console.log(`    → ${f.suggestion}`);
  }

  const mdReport = generateMarkdownReport(result);

  if (dryRun) {
    console.log('\n=== PR Comment Body (dry-run) ===\n');
    console.log(mdReport);
  } else {
    const paths = saveReviewResult(result);
    console.log(`\nSaved:`);
    console.log(`  JSON: ${paths.jsonPath}`);
    console.log(`  Markdown: ${paths.markdownPath}`);

    console.log('\nPosting PR comment...');
    await upsertReviewComment(pr, mdReport);
    console.log('Done.');

    // Create Check Run (GitHub Actions only)
    const headSha = process.env.GITHUB_SHA;
    if (headSha) {
      console.log('\nCreating GitHub Check Run...');
      const conclusion = determineConclusion(result);
      await createCheckRun({ headSha, result, conclusion });
      console.log(`Check Run created: ${conclusion}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
