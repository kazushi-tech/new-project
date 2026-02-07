---
name: draft-intake
description: "Human-authored requirement drafts intake and structuring. AI performs structuring only - no content addition or modification."
user_invocable: true
arguments:
  - name: file_path
    description: "Path to the requirement draft file (Markdown)"
    required: true
  - name: project_type
    description: "Project type (ec-site / saas / mobile-app / corporate-site)"
    required: false
  - name: template_dir
    description: "Path to industry template directory for reference"
    required: false
---

# Draft Intake Skill

Human-created requirement drafts are taken in and structured into `structured-requirements.json` format.

## Important Constraints

- AI performs **structuring only** - no content addition or modification
- All content originates from the human draft (`"source": "human"`)
- Ambiguous or missing items are flagged as findings, not filled in by AI
- If AI suggests alternatives, they MUST be tagged with `[AI提案]`

## Processing Phases

### Phase A: Draft Intake

1. Read the requirement draft file from the specified path
2. If `project_type` is given, load the matching template from `templates/{project_type}/` for reference
3. Identify document structure (headings, lists, tables)

### Phase B: Structuring

1. Convert freeform requirements into `structured-requirements.json` format
   - Schema: `data/schemas/structured-requirements.schema.json`
2. Auto-assign requirement IDs:
   - Functional: `FR-001`, `FR-002`, ...
   - Non-functional: `NFR-001`, `NFR-002`, ...
3. Classify non-functional requirements by category
4. **Do NOT add, remove, or modify requirement content**

### Phase C: Ambiguity Detection

1. Flag ambiguous expressions (e.g., "fast", "easy", "appropriate")
2. Flag missing information (e.g., no target user count specified)
3. Flag contradictory statements
4. Output all findings as a list with severity (critical / major / minor)
5. If proposing alternatives, always prefix with `[AI提案]`

## Output

Write structured output to `reviews/{requirement-id}/structured-requirements.json`

Report findings in the following format:

```
FIND-XXX: {requirement_id} - {description}
  Type: ambiguity | missing | contradiction
  Severity: critical | major | minor
  [AI提案] Suggested improvement (if any)
```
