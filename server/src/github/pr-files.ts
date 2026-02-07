import { getOctokit, getRepoParams } from './client.js';

export interface PrFileInfo {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  content?: string;
}

/**
 * PRから変更された requirements ファイルの一覧と内容を取得
 */
export async function fetchPrRequirementsFiles(prNumber: number): Promise<PrFileInfo[]> {
  const octokit = getOctokit();
  const repo = getRepoParams();

  const { data: files } = await octokit.pulls.listFiles({
    ...repo,
    pull_number: prNumber,
  });

  const reqFiles = files.filter(
    f => f.filename.startsWith('requirements/') && f.filename !== 'requirements/.gitkeep'
  );

  // Fetch content for each file
  const results: PrFileInfo[] = [];
  for (const f of reqFiles) {
    let content: string | undefined;
    if (f.status !== 'removed') {
      try {
        const { data } = await octokit.pulls.get({
          ...repo,
          pull_number: prNumber,
          mediaType: { format: 'diff' },
        });
        // Get file content from the head branch
        const { data: fileData } = await octokit.repos.getContent({
          ...repo,
          path: f.filename,
          ref: `pull/${prNumber}/head`,
        });
        if ('content' in fileData && fileData.content) {
          content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        }
      } catch {
        // Fallback: file might not be accessible
      }
    }

    results.push({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      content,
    });
  }

  return results;
}
