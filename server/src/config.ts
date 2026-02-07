import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { config as loadDotenv } from 'dotenv';
import type { SpecForgeConfig } from './types.js';

loadDotenv();

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function loadSpecForgeConfig(): SpecForgeConfig {
  const configPath = path.resolve(PROJECT_ROOT, '.specforge', 'config.yml');
  const raw = readFileSync(configPath, 'utf-8');
  const yml = parseYaml(raw);
  return {
    reviewPaths: yml.review_paths ?? ['requirements/**/*.md'],
    comment: {
      marker: yml.comment?.marker ?? '<!-- specforge-review -->',
      updateExisting: yml.comment?.update_existing ?? true,
    },
    guardrails: {
      aiCanApprove: yml.guardrails?.ai_can_approve ?? false,
      aiReviewMode: yml.guardrails?.ai_review_mode ?? 'COMMENT',
      requireAiProposalTag: yml.guardrails?.require_ai_proposal_tag ?? true,
      aiProposalPrefix: yml.guardrails?.ai_proposal_prefix ?? '[AI提案]',
      requireHumanApproval: yml.guardrails?.require_human_approval ?? true,
    },
    labels: {
      approval: yml.labels?.approval ?? 'requirements-approved',
    },
  };
}

export const specForgeConfig = loadSpecForgeConfig();

export const env = {
  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubOwner: process.env.GITHUB_OWNER ?? 'kazushi-tech',
  githubRepo: process.env.GITHUB_REPO ?? 'new-project',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;

export { PROJECT_ROOT };
