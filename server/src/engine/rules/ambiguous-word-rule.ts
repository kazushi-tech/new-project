import type { ReviewRule, ParsedDocument, ReviewFinding } from '../../types.js';

interface AmbiguousPattern {
  pattern: RegExp;
  word: string;
  suggestion: string;
}

const AMBIGUOUS_PATTERNS: AmbiguousPattern[] = [
  { pattern: /適切[なに]/g, word: '適切に/適切な', suggestion: '具体的な基準値を記載してください（例: HTTPステータスコード+日本語メッセージ）' },
  { pattern: /できるだけ/g, word: 'できるだけ', suggestion: '具体的な目標値に置き換えてください（例: 95%以上）' },
  { pattern: /迅速に/g, word: '迅速に', suggestion: '応答時間を数値で定義してください（例: 3秒以内）' },
  { pattern: /なるべく/g, word: 'なるべく', suggestion: '目標値を明記してください（例: 99.9%以上）' },
  { pattern: /十分[なに]/g, word: '十分に/十分な', suggestion: '定量的な基準を明記してください（例: 最低100件以上）' },
  { pattern: /必要に応じて/g, word: '必要に応じて', suggestion: '発動条件を明示的に記述してください（例: ユーザー数が1000を超えた場合）' },
  { pattern: /速やかに/g, word: '速やかに', suggestion: '時間制約を数値で定義してください（例: 1時間以内）' },
  { pattern: /柔軟[なに]/g, word: '柔軟に/柔軟な', suggestion: '具体的な変更パターンを列挙してください' },
  { pattern: /高速[なに]/g, word: '高速に/高速な', suggestion: '具体的な性能値を定義してください（例: 200ms以内）' },
  { pattern: /大量[のに]/g, word: '大量の/大量に', suggestion: '具体的な数量を定義してください（例: 10万件以上）' },
];

/**
 * 要件文書内の曖昧な表現を検出
 */
export class AmbiguousWordRule implements ReviewRule {
  id = 'ambiguous-word';
  name = '曖昧語検出';
  description = '要件文書内の曖昧な表現（できるだけ、適切に、迅速に等）を検出';

  run(doc: ParsedDocument): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];

      for (const ap of AMBIGUOUS_PATTERNS) {
        // Reset regex lastIndex for global patterns
        ap.pattern.lastIndex = 0;
        if (ap.pattern.test(line)) {
          // Find which requirement this line belongs to
          const ownerReq = doc.requirements.find(
            r => i + 1 >= r.lineStart && i + 1 <= r.lineEnd
          );

          findings.push({
            id: '',
            rule: this.id,
            severity: 'medium',
            category: 'clarity',
            target: ownerReq?.id,
            message: `曖昧な表現「${ap.word}」が使用されています（行 ${i + 1}）`,
            suggestion: `[AI提案] ${ap.suggestion}`,
            line: i + 1,
          });
        }
      }
    }

    return findings;
  }
}
