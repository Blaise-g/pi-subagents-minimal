---
name: code-review-diff
description: Report-only two-axis review of changes since a fixed point, with independent Standards and Spec Tasks.
workflow-version: 0.2.0
---

# Two-axis diff review

Review a caller-supplied fixed point with two independent, report-only Tasks. Resolve the fixed point and identify the originating specification and repository standards before delegation. A fixed-point `git_diff` review covers the merge base of the fixed point and HEAD through the current working tree, including committed, staged, unstaged, and non-ignored untracked evidence, plus a bounded fixed point through HEAD commit summary.

Submit one flat batch containing these Task specifications, replacing bracketed inputs inside each opaque `task` string:

```json task
{"task":"Lens: Standards. Objective: review changes since [fixed point] for violations of repository standards and material code smells. Scope: use git_diff with {comparison: \"since\", fixedPoint: \"[fixed point]\"}; inspect only relevant repository files. Standards starting points: [paths to AGENTS.md, CONTRIBUTING.md, coding standards, and the parent workflow's smell baseline]. Cite each finding with exact path/symbol or diff evidence and the controlling standard; distinguish documented violations from judgement calls and suppress tooling-enforced or overridden smells. Do not edit files or run tests/checks. Return concise findings under the Standards lens, or state that none were found.","tools":["git_diff"]}
```

```json task
{"task":"Lens: Spec. Objective: review changes since [fixed point] against the originating requirement. Scope: use git_diff with {comparison: \"since\", fixedPoint: \"[fixed point]\"}; inspect only relevant repository files. Specification starting points: [issue URL/content and spec paths]. Identify missing or partial requirements, incorrect implementations, and unrequested scope; quote or cite the requirement and exact path/symbol or diff evidence for every finding. Do not edit files or run tests/checks. Return concise findings under the Spec lens, or state that none were found.","tools":["git_diff"]}
```

If no specification exists, do not invent one: omit the Spec Task and report that the axis was unavailable. Preserve the returned reports separately under `## Standards` and `## Spec`; do not merge or rerank them. This is report-only and grants inspection capabilities, not mutation. The Orchestrator, not review Subagents, runs any tests or checks and reports that verification separately.
