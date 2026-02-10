import type { ReviewRule, ParsedDocument, ReviewFinding } from '../../types.js';
import { MissingIdRule } from './missing-id-rule.js';
import { MissingAcceptanceRule } from './missing-acceptance.js';
import { AmbiguousWordRule } from './ambiguous-word-rule.js';
import { MissingNfrRule } from './missing-nfr-rule.js';

const DEFAULT_RULES: ReviewRule[] = [
  new MissingIdRule(),
  new MissingAcceptanceRule(),
  new AmbiguousWordRule(),
  new MissingNfrRule(),
];

export function getDefaultRules(): ReviewRule[] {
  return DEFAULT_RULES;
}

export function runAllRules(doc: ParsedDocument, rules?: ReviewRule[]): ReviewFinding[] {
  const activeRules = rules ?? DEFAULT_RULES;
  const allFindings: ReviewFinding[] = [];

  for (const rule of activeRules) {
    const findings = rule.run(doc);
    allFindings.push(...findings);
  }

  return allFindings;
}
