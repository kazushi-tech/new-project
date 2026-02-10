import type { ParsedDocument, ParsedRequirement } from '../types.js';

const REQUIREMENT_ID_RE = /^(FR|NFR)-\d{3}/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const PRIORITY_RE = /\*\*優先度\*\*:\s*(must|should|could|wont)/i;
const ACCEPTANCE_RE = /受入条件|受け入れ条件|Acceptance Criteria/i;

export function parseRequirementsMarkdown(content: string): ParsedDocument {
  const lines = content.split(/\r?\n/);
  const sections: string[] = [];
  const requirements: ParsedRequirement[] = [];

  let currentH2 = '';
  let currentReq: Partial<ParsedRequirement> | null = null;
  let reqStartLine = 0;
  let inAcceptanceCriteria = false;
  let descriptionLines: string[] = [];

  let hasSecuritySection = false;
  let hasNfrSection = false;
  let hasPerformanceSection = false;
  let hasAvailabilitySection = false;
  let projectName: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(HEADING_RE);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Flush previous requirement
      if (currentReq && currentReq.title) {
        currentReq.description = descriptionLines.join('\n').trim();
        currentReq.lineEnd = i - 1;
        requirements.push(currentReq as ParsedRequirement);
        currentReq = null;
        descriptionLines = [];
        inAcceptanceCriteria = false;
      }

      if (level === 2) {
        currentH2 = title;
        sections.push(title);
        if (/非機能/.test(title)) hasNfrSection = true;
      }

      if (level === 3) {
        // Detect NFR subsections
        const lowerTitle = title.toLowerCase();
        if (/セキュリティ|security/.test(lowerTitle)) hasSecuritySection = true;
        if (/パフォーマンス|performance/.test(lowerTitle)) hasPerformanceSection = true;
        if (/可用性|availability/.test(lowerTitle)) hasAvailabilitySection = true;

        // Extract requirement ID from heading
        const idMatch = title.match(REQUIREMENT_ID_RE);
        reqStartLine = i + 1; // 1-based
        currentReq = {
          id: idMatch?.[0],
          title: title.replace(REQUIREMENT_ID_RE, '').replace(/^[:\s]+/, '').trim() || title,
          description: '',
          acceptanceCriteria: [],
          section: currentH2,
          lineStart: i + 1,
          lineEnd: i + 1,
        };
        inAcceptanceCriteria = false;
        descriptionLines = [];
      }

      continue;
    }

    // Detect project name
    if (/\*\*プロジェクト名\*\*/.test(line)) {
      const nameMatch = line.match(/:\s*(.+)/);
      if (nameMatch) projectName = nameMatch[1].trim();
    }

    if (!currentReq) continue;

    // Detect priority
    const priorityMatch = line.match(PRIORITY_RE);
    if (priorityMatch) {
      currentReq.priority = priorityMatch[1].toLowerCase();
    }

    // Detect acceptance criteria section
    if (ACCEPTANCE_RE.test(line)) {
      inAcceptanceCriteria = true;
      continue;
    }

    // Collect acceptance criteria items
    if (inAcceptanceCriteria) {
      const criteriaMatch = line.match(/^\s*-\s*\[[ x]\]\s*(.+)/);
      if (criteriaMatch) {
        currentReq.acceptanceCriteria!.push(criteriaMatch[1].trim());
      } else if (line.trim() === '' || /^\s*-\s*\*\*/.test(line)) {
        inAcceptanceCriteria = false;
        descriptionLines.push(line);
      }
    } else {
      descriptionLines.push(line);
    }
  }

  // Flush last requirement
  if (currentReq && currentReq.title) {
    currentReq.description = descriptionLines.join('\n').trim();
    currentReq.lineEnd = lines.length;
    requirements.push(currentReq as ParsedRequirement);
  }

  return {
    projectName,
    sections,
    requirements,
    rawContent: content,
    lines,
    hasSecuritySection,
    hasNfrSection,
    hasPerformanceSection,
    hasAvailabilitySection,
  };
}
