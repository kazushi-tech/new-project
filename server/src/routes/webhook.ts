import { Hono } from 'hono';
import { runReview, aggregateReviewResults } from '../engine/review-engine.js';
import { saveReviewResult, generateMarkdownReport } from '../engine/report-generator.js';
import { fetchPrRequirementsFiles } from '../github/pr-files.js';
import { upsertReviewComment } from '../github/comment.js';
import { createCheckRun, determineConclusion } from '../github/checks.js';
import { verifyGithubSignature } from '../middleware/verify-github-signature.js';

type WebhookEnv = { Variables: { webhookPayload: unknown } };

const webhook = new Hono<WebhookEnv>();

webhook.post('/api/webhooks/github', verifyGithubSignature, async (c) => {
  const event = c.req.header('x-github-event');

  if (event !== 'pull_request') {
    return c.json({ status: 'skipped', reason: `unsupported event: ${event}` });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = c.get('webhookPayload') ?? await c.req.json();
  const action = payload.action;
  const prNumber = payload.pull_request?.number;
  const headSha = payload.pull_request?.head?.sha;

  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return c.json({ status: 'skipped', reason: `unsupported action: ${action}` });
  }

  if (!prNumber) {
    return c.json({ error: 'missing pull_request.number in payload' }, 400);
  }

  // Fetch changed requirements files
  const files = await fetchPrRequirementsFiles(prNumber);
  if (files.length === 0) {
    if (headSha) {
      await createCheckRun({ headSha, conclusion: 'neutral', title: 'No requirements files changed' });
    }
    return c.json({ status: 'skipped', reason: 'no requirements files changed' });
  }

  // Review all files with content
  const allResults = [];
  for (const file of files) {
    if (!file.content) continue;
    const result = await runReview({
      source: 'pr',
      filePath: file.filename,
      prNumber,
      content: file.content,
    });
    allResults.push(result);
  }

  if (allResults.length === 0) {
    if (headSha) {
      await createCheckRun({ headSha, conclusion: 'neutral', title: 'No reviewable content found' });
    }
    return c.json({ status: 'skipped', reason: 'no reviewable content found' });
  }

  // Aggregate all results
  const result = aggregateReviewResults(allResults);

  const paths = saveReviewResult(result);
  const mdReport = generateMarkdownReport(result);
  const commentResult = await upsertReviewComment(prNumber, mdReport);

  // Create Check Run
  const conclusion = determineConclusion(result);
  let checkResult;
  if (headSha) {
    checkResult = await createCheckRun({ headSha, result, conclusion });
  }

  return c.json({
    status: 'processed',
    reviewId: result.metadata.reviewId,
    summary: result.summary,
    report: paths,
    comment: commentResult,
    check: checkResult ? { id: checkResult.id, conclusion } : undefined,
  });
});

export { webhook };
