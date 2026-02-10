import type { ReviewRule, ParsedDocument, ReviewFinding } from '../../types.js';

interface NfrCheckItem {
  name: string;
  check: (doc: ParsedDocument) => boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestion: string;
}

const NFR_CHECKS: NfrCheckItem[] = [
  {
    name: 'セキュリティ要件',
    check: (doc) => doc.hasSecuritySection,
    severity: 'high',
    suggestion: '認証・認可・暗号化・脆弱性対策等のセキュリティ要件を追加してください',
  },
  {
    name: 'パフォーマンス要件',
    check: (doc) => doc.hasPerformanceSection,
    severity: 'high',
    suggestion: '応答時間・スループット・同時接続数等のパフォーマンス要件を追加してください',
  },
  {
    name: '可用性要件',
    check: (doc) => doc.hasAvailabilitySection,
    severity: 'medium',
    suggestion: '稼働率目標・バックアップ・障害復旧（RTO/RPO）等の可用性要件を追加してください',
  },
  {
    name: '非機能要件セクション',
    check: (doc) => doc.hasNfrSection,
    severity: 'high',
    suggestion: '非機能要件セクションを追加してください（パフォーマンス、セキュリティ、可用性、運用等）',
  },
  {
    name: '監視・ログ要件',
    check: (doc) => /監視|ログ|モニタリング|logging|monitoring/i.test(doc.rawContent),
    severity: 'medium',
    suggestion: '監視・ログ・アラート等の運用要件を追加してください',
  },
  {
    name: 'データ保持・プライバシー要件',
    check: (doc) => /データ保持|個人情報保護|プライバシー|GDPR|data retention|privacy/i.test(doc.rawContent),
    severity: 'medium',
    suggestion: 'データ保持期間・個人情報保護・プライバシーポリシー等の要件を追加してください',
  },
];

/**
 * セキュリティ・非機能要件の欠落を警告
 */
export class MissingNfrRule implements ReviewRule {
  id = 'missing-nfr';
  name = 'セキュリティ・非機能要件欠落警告';
  description = 'セキュリティ・パフォーマンス・可用性等の非機能要件が欠落している場合を警告';

  run(doc: ParsedDocument): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const item of NFR_CHECKS) {
      if (!item.check(doc)) {
        findings.push({
          id: '',
          rule: this.id,
          severity: item.severity,
          category: 'completeness',
          message: `${item.name}が定義されていません`,
          suggestion: `[AI提案] ${item.suggestion}`,
        });
      }
    }

    return findings;
  }
}
