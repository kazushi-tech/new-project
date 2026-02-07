import { Hono } from 'hono';
import type { ReviewRunRequest } from '../types.js';
import { runReview } from '../engine/review-engine.js';
import { saveReviewResult, generateMarkdownReport } from '../engine/report-generator.js';
import { fetchPrRequirementsFiles } from '../github/pr-files.js';
import { upsertReviewComment } from '../github/comment.js';

const review = new Hono();

review.post('/api/review/run', async (c) => {
  const body = await c.req.json<ReviewRunRequest>();

  if (body.source === 'file') {
    if (!body.filePath) {
      return c.json({ error: 'filePath is required when source is "file"' }, 400);
    }

    const result = runReview({ source: 'file', filePath: body.filePath });

    if (body.dryRun) {
      return c.json({
        reviewId: result.metadata.reviewId,
        summary: result.summary,
        findings: result.findings,
        markdownPreview: generateMarkdownReport(result),
      });
    }

    const paths = saveReviewResult(result);
    return c.json({
      reviewId: result.metadata.reviewId,
      summary: result.summary,
      findings: result.findings,
      report: paths,
    });
  }

  if (body.source === 'pr') {
    if (!body.prNumber) {
      return c.json({ error: 'prNumber is required when source is "pr"' }, 400);
    }

    const files = await fetchPrRequirementsFiles(body.prNumber);
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
      prNumber: body.prNumber,
      content: targetFile.content,
    });

    if (body.dryRun) {
      return c.json({
        reviewId: result.metadata.reviewId,
        summary: result.summary,
        findings: result.findings,
        markdownPreview: generateMarkdownReport(result),
      });
    }

    const paths = saveReviewResult(result);
    const mdReport = generateMarkdownReport(result);
    const commentResult = await upsertReviewComment(body.prNumber, mdReport);

    return c.json({
      reviewId: result.metadata.reviewId,
      summary: result.summary,
      findings: result.findings,
      report: paths,
      comment: commentResult,
    });
  }

  return c.json({ error: 'source must be "file" or "pr"' }, 400);
});

export { review };
