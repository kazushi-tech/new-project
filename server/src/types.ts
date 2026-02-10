// === Review Finding ===
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FindingCategory = 'completeness' | 'clarity' | 'consistency' | 'testability';

export interface ReviewFinding {
  id: string;
  rule: string;
  severity: Severity;
  category: FindingCategory;
  target?: string;
  message: string;
  suggestion: string;
  line?: number;
}

// === Review Result ===
export interface FileReviewSummary {
  path: string;
  findingCount: number;
  qualityScore: number;
  bySeverity: Record<Severity, number>;
}

export interface ReviewProviderMetadata {
  configuredProvider: 'gemini' | 'rule-based';
  effectiveProvider: 'gemini' | 'rule-based';
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface ReviewResult {
  metadata: {
    reviewId: string;
    timestamp: string;
    source: { type: 'file' | 'pr'; path?: string; paths?: string[]; prNumber?: number };
    rulesApplied: string[];
    reviewProvider?: ReviewProviderMetadata;
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    qualityScore: number;
    fileCount?: number;
  };
  findings: ReviewFinding[];
  fileResults?: FileReviewSummary[];
}

// === Parsed Document ===
export interface ParsedRequirement {
  id?: string;
  title: string;
  description: string;
  priority?: string;
  acceptanceCriteria: string[];
  section: string;
  lineStart: number;
  lineEnd: number;
}

export interface ParsedDocument {
  projectName?: string;
  sections: string[];
  requirements: ParsedRequirement[];
  rawContent: string;
  lines: string[];
  hasSecuritySection: boolean;
  hasNfrSection: boolean;
  hasPerformanceSection: boolean;
  hasAvailabilitySection: boolean;
}

// === Review Rule Interface ===
export interface ReviewRule {
  id: string;
  name: string;
  description: string;
  run(doc: ParsedDocument): ReviewFinding[];
}

// === Config ===
export interface SpecForgeConfig {
  reviewPaths: string[];
  comment: { marker: string; updateExisting: boolean };
  guardrails: {
    aiCanApprove: boolean;
    aiReviewMode: string;
    requireAiProposalTag: boolean;
    aiProposalPrefix: string;
    requireHumanApproval: boolean;
  };
  labels: { approval: string };
}

// === API ===
export interface ReviewRunRequest {
  source: 'file' | 'pr';
  filePath?: string;
  prNumber?: number;
  dryRun?: boolean;
}

export interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}
