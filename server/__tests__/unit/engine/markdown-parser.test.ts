import { describe, it, expect } from 'vitest';
import { parseRequirementsMarkdown } from '../../../src/engine/markdown-parser.js';

const SAMPLE_MD = `# テスト要件

## 1. プロジェクト概要

- **プロジェクト名**: TestProject

## 2. 機能要件

### FR-001: ユーザー登録

- **優先度**: must
- **説明**: メールでの登録
- **受入条件**:
  - [ ] メールで登録できること
  - [ ] パスワードリセットが可能なこと

### FR-002: 検索機能

- **優先度**: should
- **説明**: キーワード検索

## 3. 非機能要件

### NFR-001: パフォーマンス

- レスポンス: 2秒以内

### NFR-002: セキュリティ

- SSL/TLS必須
`;

describe('parseRequirementsMarkdown', () => {
  it('should extract project name', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.projectName).toBe('TestProject');
  });

  it('should extract sections', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.sections).toContain('1. プロジェクト概要');
    expect(doc.sections).toContain('2. 機能要件');
    expect(doc.sections).toContain('3. 非機能要件');
  });

  it('should parse functional requirements with IDs', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    const fr001 = doc.requirements.find(r => r.id === 'FR-001');
    expect(fr001).toBeDefined();
    expect(fr001!.priority).toBe('must');
    expect(fr001!.acceptanceCriteria).toHaveLength(2);
  });

  it('should parse NFR requirements', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    const nfr001 = doc.requirements.find(r => r.id === 'NFR-001');
    expect(nfr001).toBeDefined();
    expect(nfr001!.acceptanceCriteria).toHaveLength(0);
  });

  it('should detect security section', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.hasSecuritySection).toBe(true);
  });

  it('should detect performance section', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.hasPerformanceSection).toBe(true);
  });

  it('should detect NFR section', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.hasNfrSection).toBe(true);
  });

  it('should detect missing availability section', () => {
    const doc = parseRequirementsMarkdown(SAMPLE_MD);
    expect(doc.hasAvailabilitySection).toBe(false);
  });
});
