import type { ReviewFinding } from '../types.js';

export interface AiReviewRequest {
  content: string;
  filePath?: string;
}

export interface AiReviewResponse {
  findings: ReviewFinding[];
  summary: string;
}

export type GeminiErrorCategory =
  | 'auth_failure'
  | 'rate_limit'
  | 'transient'
  | 'invalid_response'
  | 'input_too_large'
  | 'unknown';

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly category: GeminiErrorCategory,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}
