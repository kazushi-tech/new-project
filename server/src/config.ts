import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { config as loadDotenv } from 'dotenv';
import type { SpecForgeConfig } from './types.js';

loadDotenv();

const PROJECT_ROOT = process.cwd();

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

export type ReviewProviderType = 'gemini' | 'rule-based';
export type ReviewProviderRaw = 'auto' | 'gemini' | 'rule-based';

export interface ReviewProviderConfig {
  configured: ReviewProviderType;
  effective: ReviewProviderType;
  geminiConfigured: boolean;
}

const VALID_PROVIDERS = ['auto', 'gemini', 'rule-based'] as const;

function parseReviewProvider(raw: string | undefined): ReviewProviderRaw {
  if (!raw || !VALID_PROVIDERS.includes(raw as ReviewProviderRaw)) {
    return 'auto';
  }
  return raw as ReviewProviderRaw;
}

export const env = {
  githubToken: process.env.GITHUB_TOKEN ?? '',
  githubOwner: process.env.GITHUB_OWNER ?? 'kazushi-tech',
  githubRepo: process.env.GITHUB_REPO ?? 'new-project',
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  adminUiToken: process.env.ADMIN_UI_TOKEN ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  reviewProviderRaw: parseReviewProvider(process.env.REVIEW_PROVIDER),
} as const;

export function getReviewProviderConfig(): ReviewProviderConfig {
  const geminiConfigured = Boolean(env.geminiApiKey);
  let configured: ReviewProviderType;

  if (env.reviewProviderRaw === 'auto') {
    configured = geminiConfigured ? 'gemini' : 'rule-based';
  } else {
    configured = env.reviewProviderRaw;
  }

  const effective = (configured === 'gemini' && !geminiConfigured)
    ? 'rule-based'
    : configured;

  return { configured, effective, geminiConfigured };
}

export function validateConfig(): void {
  if (env.nodeEnv === 'production') {
    if (env.reviewProviderRaw === 'gemini' && !env.geminiApiKey) {
      throw new Error(
        'GEMINI_API_KEY is required when REVIEW_PROVIDER=gemini in production'
      );
    }
  } else {
    if (env.reviewProviderRaw === 'gemini' && !env.geminiApiKey) {
      console.warn(
        '[config] WARNING: REVIEW_PROVIDER=gemini but GEMINI_API_KEY is not set. Falling back to rule-based.'
      );
    }
  }
}

export { PROJECT_ROOT };
