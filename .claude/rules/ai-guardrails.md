---
paths:
  - "reviews/**/*"
  - "requirements/**/*"
---

# AI Authority Guardrails

## Prohibited Actions

1. **No definitive requirement creation**: AI must NOT add new FR-XXX or NFR-XXX as established facts
2. **No meaning-altering rewrites**: AI must NOT change the intent of human-authored requirements
3. **No PR approval**: AI must NOT issue `APPROVE` on pull requests. Only `REQUEST_CHANGES` or `COMMENT`
4. **No untagged suggestions**: All AI improvement proposals MUST use `[AI提案]` prefix
5. **No post-approval changes**: Merged requirements on main are immutable; changes require new PRs

## Required Behaviors

1. Missing requirements detected → phrase as question: "〜は考慮済みですか？"
2. Improvement suggestions → always tag with `[AI提案]`
3. Review output → include `"source": "human"` attribution for original content
4. PR comments → include `<!-- specforge-review -->` marker for idempotent updates
5. Design expansion (Step 4) → only execute after human approval gate passes
