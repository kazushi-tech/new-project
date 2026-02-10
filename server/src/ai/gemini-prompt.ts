export function buildReviewPrompt(content: string, filePath?: string): string {
  const fileContext = filePath ? `\nファイル: ${filePath}` : '';
  return `あなたは要件定義書のレビュー専門家です。以下の要件定義ドキュメントをレビューし、問題点を指摘してください。${fileContext}

## レビュー観点
1. **completeness（完全性）**: 要件に欠落がないか
2. **clarity（明確性）**: 曖昧な表現がないか
3. **consistency（一貫性）**: 矛盾する記述がないか
4. **testability（テスト可能性）**: テスト可能な受け入れ基準があるか

## 出力形式
以下のJSON配列で回答してください。問題がなければ空配列 [] を返してください。

\`\`\`json
[
  {
    "rule": "ai-review",
    "severity": "critical" | "high" | "medium" | "low",
    "category": "completeness" | "clarity" | "consistency" | "testability",
    "target": "対象セクションや要件名",
    "message": "問題の説明",
    "suggestion": "[AI提案] 改善案"
  }
]
\`\`\`

重要:
- suggestion は必ず "[AI提案]" プレフィックスで開始してください
- severity は問題の深刻度に応じて適切に設定してください
- 日本語で回答してください

## 対象ドキュメント

${content}`;
}
