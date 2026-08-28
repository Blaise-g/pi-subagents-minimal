---
name: code-simplify
description: Report-only simplification review of working-tree changes through independent Reuse, Quality, and Efficiency Tasks.
workflow-version: 0.2.0
---

# Three-lens simplification review

Review HEAD through the current working tree as three independent, report-only Tasks. `git_diff` with `working_tree` includes all current staged, unstaged, and non-ignored untracked evidence.

Submit one flat batch containing these Task specifications:

```json task
{"task":"Lens: Reuse. Objective: find changed code that duplicates existing helpers, utilities, or nearby patterns. Scope: use git_diff with {comparison: \"working_tree\"}; inspect relevant changed and repository files for concrete reuse candidates. Cite exact path/symbol or diff evidence and name the existing replacement and concrete simplification. Do not edit files or run tests/checks. Return concise findings under the Reuse lens, or state that none were found.","tools":["git_diff"]}
```

```json task
{"task":"Lens: Quality. Objective: find avoidable complexity in changed code, including redundant state, parameter sprawl, near-duplication, leaky abstractions, stringly typed values, needless nesting, and comments that narrate rather than explain constraints. Scope: use git_diff with {comparison: \"working_tree\"}; inspect only relevant repository files. Cite exact path/symbol or diff evidence and give a concrete simplification; treat findings as judgement calls. Do not edit files or run tests/checks. Return concise findings under the Quality lens, or state that none were found.","tools":["git_diff"]}
```

```json task
{"task":"Lens: Efficiency. Objective: find material unnecessary work in changed code, including repeated I/O or computation, missed safe concurrency, hot-path work, no-op updates, existence prechecks, leaks, and overly broad reads. Scope: use git_diff with {comparison: \"working_tree\"}; inspect only relevant repository files. Cite exact path/symbol or diff evidence, explain impact, and give a concrete fix; omit speculative micro-optimizations. Do not edit files or run tests/checks. Return concise findings under the Efficiency lens, or state that none were found.","tools":["git_diff"]}
```

Preserve surviving reports separately under `## Reuse`, `## Quality`, and `## Efficiency`; do not merge or rerank lenses. This is report-only and grants inspection capabilities, not mutation. The Orchestrator, not review Subagents, runs any tests or checks and reports that verification separately.
