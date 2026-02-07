import { getOctokit, getRepoParams } from './client.js';
import { specForgeConfig } from '../config.js';

const MARKER = specForgeConfig.comment.marker;

/**
 * PRコメントのupsert（重複防止）
 * マーカー `<!-- specforge-review -->` を含む既存コメントがあれば更新、なければ新規作成
 */
export async function upsertReviewComment(prNumber: number, body: string): Promise<{ action: 'created' | 'updated'; commentId: number }> {
  const octokit = getOctokit();
  const repo = getRepoParams();

  // Ensure body contains the marker
  const commentBody = body.includes(MARKER) ? body : `${MARKER}\n${body}`;

  // Search for existing comment with marker
  const { data: comments } = await octokit.issues.listComments({
    ...repo,
    issue_number: prNumber,
  });

  const existing = comments.find(c => c.body?.includes(MARKER));

  if (existing) {
    await octokit.issues.updateComment({
      ...repo,
      comment_id: existing.id,
      body: commentBody,
    });
    return { action: 'updated', commentId: existing.id };
  } else {
    const { data: created } = await octokit.issues.createComment({
      ...repo,
      issue_number: prNumber,
      body: commentBody,
    });
    return { action: 'created', commentId: created.id };
  }
}
