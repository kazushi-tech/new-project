import { describe, it, expect } from 'vitest';
import { MissingAcceptanceRule } from '../../../../src/engine/rules/missing-acceptance.js';
import { parseRequirementsMarkdown } from '../../../../src/engine/markdown-parser.js';

const rule = new MissingAcceptanceRule();

describe('MissingAcceptanceRule', () => {
  it('should not flag requirements with acceptance criteria', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: ユーザー登録

- **優先度**: must
- **説明**: メール登録
- **受入条件**:
  - [ ] メールで登録できること
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(0);
  });

  it('should flag must requirements without acceptance criteria as critical', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: ユーザー登録

- **優先度**: must
- **説明**: メール登録
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].target).toBe('FR-001');
  });

  it('should flag should requirements as high severity', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-002: 検索機能

- **優先度**: should
- **説明**: キーワード検索
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
  });

  it('should flag NFR without acceptance criteria', () => {
    const doc = parseRequirementsMarkdown(`
## 非機能要件

### NFR-001: パフォーマンス

- レスポンス: 2秒以内
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('NFR-001');
  });
});
