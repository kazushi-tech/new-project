import type { ReviewRule, ParsedDocument, ReviewFinding } from '../../types.js';

const REQUIREMENT_ID_RE = /^(FR|NFR)-\d{3}/;

/**
 * 要件ブロックにFR-XXX / NFR-XXX IDが未記載の場合を検出
 */
export class MissingIdRule implements ReviewRule {
  id = 'missing-id';
  name = '要件ID未記載検出';
  description = '要件ブロック（### 見出し配下）に FR-XXX / NFR-XXX パターンがない場合を検出';

  run(doc: ParsedDocument): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const req of doc.requirements) {
      // Skip non-requirement sections like "プロジェクト概要", "ユーザーロール", "未決定事項"
      if (this.isNonRequirementSection(req.section)) continue;

      if (!req.id || !REQUIREMENT_ID_RE.test(req.id)) {
        findings.push({
          id: '', // assigned by engine
          rule: this.id,
          severity: 'high',
          category: 'consistency',
          target: req.title,
          message: `要件「${req.title}」に要件ID（FR-XXX / NFR-XXX）が記載されていません`,
          suggestion: `[AI提案] 要件IDを付与してください（例: FR-XXX: ${req.title}）`,
          line: req.lineStart,
        });
      }
    }

    return findings;
  }

  private isNonRequirementSection(section: string): boolean {
    return /プロジェクト概要|ユーザーロール|目次|概要/.test(section);
  }
}
