import { runReview } from '../engine/review-engine.js';
import { saveReviewResult, generateMarkdownReport } from '../engine/report-generator.js';

function parseArgs(args: string[]): { file?: string; dryRun: boolean } {
  let file: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      file = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  return { file, dryRun };
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error('Usage: npm run review:local -- --file <path> [--dry-run]');
    process.exit(1);
  }

  console.log(`\nReviewing: ${file}`);
  console.log(`Dry-run: ${dryRun}\n`);

  const result = await runReview({ source: 'file', filePath: file });

  console.log('=== Review Summary ===');
  console.log(`Review ID: ${result.metadata.reviewId}`);
  console.log(`Total findings: ${result.summary.totalFindings}`);
  console.log(`Quality score: ${result.summary.qualityScore}/10`);
  console.log(`Severity breakdown:`, result.summary.bySeverity);
  console.log('');

  for (const f of result.findings) {
    const target = f.target ? ` (${f.target})` : '';
    const line = f.line ? ` [line ${f.line}]` : '';
    console.log(`  ${f.id} [${f.severity}]${target}${line}: ${f.message}`);
    console.log(`    → ${f.suggestion}`);
  }

  if (dryRun) {
    console.log('\n=== Markdown Report (dry-run) ===\n');
    console.log(generateMarkdownReport(result));
  } else {
    const paths = saveReviewResult(result);
    console.log(`\nSaved:`);
    console.log(`  JSON: ${paths.jsonPath}`);
    console.log(`  Markdown: ${paths.markdownPath}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
