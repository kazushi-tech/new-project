import { Octokit } from '@octokit/rest';
import { env } from '../config.js';

let _octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!_octokit) {
    if (!env.githubToken) {
      throw new Error('GITHUB_TOKEN is not set. Please configure it in .env file.');
    }
    _octokit = new Octokit({ auth: env.githubToken });
  }
  return _octokit;
}

export function getRepoParams() {
  return { owner: env.githubOwner, repo: env.githubRepo };
}
