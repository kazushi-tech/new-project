import { describe, it, expect } from 'vitest';
import { MissingIdRule } from '../../../../src/engine/rules/missing-id-rule.js';
import { parseRequirementsMarkdown } from '../../../../src/engine/markdown-parser.js';

const rule = new MissingIdRule();

describe('MissingIdRule', () => {
  it('should not flag requirements with valid IDs', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: ユーザー登録

- **説明**: メール登録
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(0);
  });

  it('should flag requirements without IDs in requirement sections', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### ユーザー登録

- **説明**: メール登録
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].rule).toBe('missing-id');
  });

  it('should skip non-requirement sections', () => {
    const doc = parseRequirementsMarkdown(`
## プロジェクト概要

### テスト項目

- 概要内容
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(0);
  });
});
