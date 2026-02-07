import { Hono } from 'hono';
import { runReview } from '../engine/review-engine.js';
import { saveReviewResult, generateMarkdownReport } from '../engine/report-generator.js';
import { fetchPrRequirementsFiles } from '../github/pr-files.js';
import { upsertReviewComment } from '../github/comment.js';

const webhook = new Hono();

webhook.post('/api/webhooks/github', async (c) => {
  const event = c.req.header('x-github-event');

  if (event !== 'pull_request') {
    return c.json({ status: 'skipped', reason: `unsupported event: ${event}` });
  }

  const payload = await c.req.json();
  const action = payload.action;
  const prNumber = payload.pull_request?.number;

  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return c.json({ status: 'skipped', reason: `unsupported action: ${action}` });
  }

  if (!prNumber) {
    return c.json({ error: 'missing pull_request.number in payload' }, 400);
  }

  // Fetch changed requirements files
  const files = await fetchPrRequirementsFiles(prNumber);
  if (files.length === 0) {
    return c.json({ status: 'skipped', reason: 'no requirements files changed' });
  }

  // Review first file with content
  const targetFile = files.find(f => f.content);
  if (!targetFile?.content) {
    return c.json({ status: 'skipped', reason: 'no reviewable content found' });
  }

  const result = runReview({
    source: 'pr',
    filePath: targetFile.filename,
    prNumber,
    content: targetFile.content,
  });

  const paths = saveReviewResult(result);
  const mdReport = generateMarkdownReport(result);
  const commentResult = await upsertReviewComment(prNumber, mdReport);

  return c.json({
    status: 'processed',
    reviewId: result.metadata.reviewId,
    summary: result.summary,
    report: paths,
    comment: commentResult,
  });
});

export { webhook };
