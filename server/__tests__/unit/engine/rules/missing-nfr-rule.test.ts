import { describe, it, expect } from 'vitest';
import { MissingNfrRule } from '../../../../src/engine/rules/missing-nfr-rule.js';
import { parseRequirementsMarkdown } from '../../../../src/engine/markdown-parser.js';

const rule = new MissingNfrRule();

describe('MissingNfrRule', () => {
  it('should flag when no NFR section exists', () => {
    const doc = parseRequirementsMarkdown(`
## 機能要件

### FR-001: ユーザー登録

- メール登録
`);
    const findings = rule.run(doc);
    // Should flag: NFR section, security, performance, availability, monitoring, privacy
    expect(findings.length).toBeGreaterThanOrEqual(4);
  });

  it('should not flag existing security section', () => {
    const doc = parseRequirementsMarkdown(`
## 非機能要件

### セキュリティ

- SSL/TLS必須

### パフォーマンス

- 2秒以内

### 可用性

- 99.5%

監視とログの設定

データ保持ポリシーあり
`);
    const findings = rule.run(doc);
    expect(findings).toHaveLength(0);
  });

  it('should flag missing monitoring requirements', () => {
    const doc = parseRequirementsMarkdown(`
## 非機能要件

### セキュリティ

- SSL

### パフォーマンス

- 2秒

### 可用性

- 99.5%
`);
    const findings = rule.run(doc);
    const monitoringFinding = findings.find(f => f.message.includes('監視'));
    expect(monitoringFinding).toBeDefined();
  });
});
