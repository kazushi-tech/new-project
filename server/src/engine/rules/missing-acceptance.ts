import type { ReviewRule, ParsedDocument, ReviewFinding } from '../../types.js';

/**
 * 受入条件が欠落している要件を検出
 */
export class MissingAcceptanceRule implements ReviewRule {
  id = 'missing-acceptance';
  name = '受入条件欠落検出';
  description = 'FR/NFR IDを持つ要件に受入条件が定義されていない場合を検出';

  run(doc: ParsedDocument): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const req of doc.requirements) {
      if (!req.id) continue;

      const isFunctional = req.id.startsWith('FR-');
      const isNfr = req.id.startsWith('NFR-');

      if (isFunctional && req.acceptanceCriteria.length === 0) {
        const severity = this.severityForPriority(req.priority);
        findings.push({
          id: '',
          rule: this.id,
          severity,
          category: 'testability',
          target: req.id,
          message: `${req.id}「${req.title}」に受入条件が定義されていません`,
          suggestion: `[AI提案] テスト可能な受入条件を追加してください（例: 「〜できること」形式で具体的な条件を列挙）`,
          line: req.lineStart,
        });
      }

      if (isNfr && req.acceptanceCriteria.length === 0) {
        // NFRは指標があっても受入条件フォーマットでない場合がある
        findings.push({
          id: '',
          rule: this.id,
          severity: 'high',
          category: 'testability',
          target: req.id,
          message: `${req.id}「${req.title}」に受入条件（チェックリスト形式）が定義されていません`,
          suggestion: `[AI提案] 非機能要件にもテスト可能な受入条件を追加してください（例: 「レスポンスタイム2秒以内であること」）`,
          line: req.lineStart,
        });
      }
    }

    return findings;
  }

  private severityForPriority(priority?: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (priority?.toLowerCase()) {
      case 'must': return 'critical';
      case 'should': return 'high';
      case 'could': return 'medium';
      default: return 'high';
    }
  }
}
