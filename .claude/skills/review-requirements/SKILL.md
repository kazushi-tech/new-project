---
name: review-requirements
description: "Main review orchestration: AI reviews human-authored requirement drafts and posts findings as PR comments"
user_invocable: true
arguments:
  - name: pr_number
    description: "Target PR number for review"
    required: true
  - name: project_type
    description: "Project type (ec-site / saas / mobile-app / corporate-site)"
    required: false
  - name: output_dir
    description: "Review result output directory"
    default: "./reviews"
---

# Review Requirements Skill (MVP)

Orchestrates AI review of human-authored requirement drafts. MVP uses a single agent (`requirements-analyst`). Phase 2 will add parallel multi-agent review.

## AI Authority Rules

### Prohibited

- Adding new requirements definitively (no new FR/NFR creation)
- Rewriting that changes meaning of existing requirements
- Issuing PR `APPROVE` (only `REQUEST_CHANGES` or `COMMENT`)
- Suggestions without `[AI提案]` tag
- Modifying approved requirements post-merge

### Permitted

- Flagging ambiguous expressions (PR inline comment)
- Asking about omissions: "〜は考慮済みですか？" (PR comment)
- Visualizing impact scope (Check Run summary)
- Test coverage analysis (PR comment)
- API/DB consistency checks (PR inline comment)
- Security risk reporting with severity (PR comment)
- Improvement proposals with `[AI提案]` tag (PR comment)
- Quality score calculation (Check Run)

## MVP Flow (Phase 1: Single Agent)

1. Identify changed requirement files from the PR
2. Run `draft-intake` skill to structure the requirements
3. Launch `requirements-analyst` agent (via Task tool) with structured input
4. Collect review results
5. Post findings as PR comment with `<!-- specforge-review -->` marker
   - If a comment with this marker already exists, UPDATE it (no duplicates)
6. Save review report to `{output_dir}/{requirement-id}/`

## Phase 2 Flow (Future: Multi-Agent)

Steps 1-2 same as MVP, then:

3. Launch 4 review agents in parallel (Task tool x4):
   - `requirements-analyst`: Quality, completeness, clarity
   - `security-reviewer`: Security risk assessment
   - `test-planner`: Testability review
   - `document-integrator`: Cross-document consistency
4. Aggregate all findings
5. Post combined review as PR comment + Check Run summary
6. Save individual reports to `{output_dir}/`

## PR Comment Format

```markdown
<!-- specforge-review -->
## SpecForge Requirements Review

> Reviewed: {timestamp} | Commit: {sha} | Agent: requirements-analyst

### Quality Score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | X/10 | ... |
| Clarity | X/10 | ... |
| Consistency | X/10 | ... |
| Testability | X/10 | ... |

### Findings ({count})

#### Critical
- FIND-001: ...

#### Major
- FIND-002: ...

#### Minor
- FIND-003: ...

### Unresolved Issues
- ISS-001: ...

---
> [AI提案] items are suggestions only. Human approval required.
> AI does NOT approve this PR.
```

## Output Files

- `{output_dir}/{req-id}/review-{date}.json` - Structured review results
- `{output_dir}/summary/latest-report.md` - Latest review summary
