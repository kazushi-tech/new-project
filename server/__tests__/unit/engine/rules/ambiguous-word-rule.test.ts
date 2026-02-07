import { describe, it, expect } from 'vitest';
import { AmbiguousWordRule } from '../../../../src/engine/rules/ambiguous-word-rule.js';
import { parseRequirementsMarkdown } from '../../../../src/engine/markdown-parser.js';

const rule = new AmbiguousWordRule();

describe('AmbiguousWordRule', () => {
  it('should detect "適切な" as ambiguous', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: エラー処理

- **説明**: 適切なエラーメッセージを表示
`);
    const findings = rule.run(doc);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.some(f => f.message.includes('適切'))).toBe(true);
    expect(findings[0].severity).toBe('medium');
  });

  it('should detect "できるだけ"', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: 性能

- できるだけ速く処理する
`);
    const findings = rule.run(doc);
    expect(findings.some(f => f.message.includes('できるだけ'))).toBe(true);
  });

  it('should detect "迅速に"', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: レスポンス

- 迅速にレスポンスを返す
`);
    const findings = rule.run(doc);
    expect(findings.some(f => f.message.includes('迅速に'))).toBe(true);
  });

  it('should not flag precise language', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: レスポンス

- レスポンスタイムは2秒以内
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(0);
  });

  it('should associate finding with the correct requirement', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-005: 決済

- 適切なエラーメッセージを表示
`);
    const findings = rule.run(doc);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].target).toBe('FR-005');
  });
});
