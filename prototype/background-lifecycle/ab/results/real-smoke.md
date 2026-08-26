# Real background smoke comparison

One matched repository-reading task using parent and child model `openai-codex/gpt-5.6-luna` at medium Thinking level. The Orchestrator launched one background Investigation, read `CONTEXT.md` while it ran, and retrieved the child’s one-sentence reading of `README.md`.

| Contract | Initial/max parent tool bytes | Parent turns | Parent input/output tokens | Tool sequence |
|---|---:|---:|---:|---|
| Published Arhen 1.3.46 | 8,895 / 8,895 | 8 | 11,351 / 503 | `subagent` → `subagent_status` → `read` → `subagent_result` → `subagent_result` |
| Proposed minimal | 1,124 / 1,124 | 5 | 5,649 / 314 | `delegate` → `read` → `delegation_control` → `delegation_control` |

Both completed correctly and allowed useful parent work while the child ran.

## Observations

- Arhen explicitly instructed the model to call status immediately after launch. It then exposed a live child session path, delivered a completion notification, and returned the correct result.
- Arhen retrieved the same terminal result twice. Its queued completion notification arrived after the first retrieval and prompted another retrieval. This is the same stale-notification race seen in the first normalized minimal run when completion used `followUp` delivery.
- The corrected minimal variant delivered completion as `steer`, before the next provider request. In the real smoke the first inspection truthfully returned `running`; the completion signal then arrived and the second inspection returned the terminal result. It did not retrieve the terminal result twice.
- Dynamic loading kept `delegation_control` out of the stable initial tool schema. On GPT-5.6 Luna, Pi represented the later addition through its native deferred-tool protocol, so the top-level `tools` array stayed at 1,124 bytes.
- Arhen’s persisted session path improves recoverability. The minimal smoke kept only a bounded in-memory terminal result; shutdown/reload recovery remains the principal cost of choosing the minimal contract.

## Interpretation

This is one stochastic smoke run, not a reliability benchmark. Parent token totals include different interaction paths and cannot be attributed to schema size alone. Arhen’s package also includes graph, intercom, steering, persistence, worktree, and agent-file behavior outside v1, while `minimal-real.ts` is deliberately throwaway code.

The useful directional result is narrower: **the minimal lifecycle completed the same background interaction with one dynamic control operation, while the broad permanent lifecycle did not expose a necessary parent behavior that the minimal shape lacked.**
