# Normalized lifecycle A/B/C results

Parent model: `openai-codex/gpt-5.6-luna`, medium Thinking level. Child execution is deterministic and fake so this compares parent-facing contracts, not runtime implementations. One stochastic run per cell; directional only.

| Variant | Scenario | Initial / max tool bytes | Turns | Input / output tokens | Tool sequence |
|---|---|---:|---:|---:|---|
| arhen-style | batch | 1,684 / 1,684 | 5 | 4,092 / 204 | `subagent` → `parent_work` → `parent_work` → `subagent_result` |
| arhen-style | cancel-queued | 1,684 / 1,684 | 4 | 3,129 / 324 | `subagent` → `subagent_cancel` → `subagent_status` → `subagent_result` |
| arhen-style | cancel-running | 1,684 / 1,684 | 5 | 4,009 / 203 | `subagent` → `parent_work` → `subagent_cancel` → `subagent_result` |
| arhen-style | research | 1,684 / 1,684 | 5 | 3,988 / 174 | `subagent` → `parent_work` → `parent_work` → `subagent_result` |
| minimal-background | batch | 849 / 849 | 5 | 4,065 / 204 | `delegate` → `parent_work` → `parent_work` → `delegation_control` |
| minimal-background | cancel-queued | 849 / 849 | 4 | 3,191 / 216 | `delegate` → `delegation_control` → `delegation_control` |
| minimal-background | cancel-running | 849 / 849 | 5 | 4,112 / 236 | `delegate` → `parent_work` → `delegation_control` → `delegation_control` |
| minimal-background | research | 849 / 849 | 5 | 4,061 / 208 | `delegate` → `parent_work` → `parent_work` → `delegation_control` |
| official-style | batch | 841 / 841 | 2 | 1,375 / 192 | `delegate` → `parent_work` → `parent_work` |
| official-style | cancel-queued | 841 / 841 | 3 | 2,516 / 644 | `delegate` → `parent_work` |
| official-style | cancel-running | 841 / 841 | 3 | 2,574 / 795 | `delegate` → `parent_work` |
| official-style | research | 841 / 841 | 3 | 2,076 / 233 | `delegate` → `parent_work` → `parent_work` |

## Final model verdicts

- **arhen-style / batch:** Verdict: S-01 completed with a mixed result—2 of 3 tasks succeeded, and 1 failed.
- **arhen-style / cancel-queued:** Verdict: Started Investigation S-01 (“slow lookup”), cancelled it before `parent_work`, and inspected the terminal result: cancellation settled. Queued cancellation is unsupported.
- **arhen-style / cancel-running:** Verdict: S-01 was cancelled successfully after reaching running state. Terminal result confirmed: “cancellation settled.” Running cancellation is supported.
- **arhen-style / research:** Verdict: Parent work overlapped the Delegation. S-01 found that cancellation requires settlement before disposal.
- **minimal-background / batch:** Verdict: D-01 terminated mixed—2 of 3 tasks succeeded; “simplification” failed.
- **minimal-background / cancel-queued:** D-01 inspection: cancellation settled. Queued cancellation is supported.
- **minimal-background / cancel-running:** Verdict: Investigation “slow lookup” was cancelled while running and reached terminal state. Its bounded result confirms cancellation settled. Running cancellation is supported.
- **minimal-background / research:** D-01 succeeded: cancellation requires settlement before disposal. Verdict: Yes, both parent-work steps overlapped the Delegation.
- **official-style / batch:** Verdict: Flat batch completed with a mixed result—2 of 3 tasks succeeded and 1 failed. Both parent steps completed.
- **official-style / cancel-queued:** Verdict: The “slow lookup” Investigation was canceled before `parent_work`. Terminal result: “cancellation requires settlement before disposal.” Queued cancellation is unsupported.
- **official-style / cancel-running:** Verdict: Started one Investigation for “slow lookup,” performed exactly one parent step (“advance to running”), and inspected its terminal result. Running cancellation is unsupported.
- **official-style / research:** Delegation result: cancellation requires settlement before disposal. Verdict: parent work did not overlap the Delegation; it had already completed.

## Directional findings

- Official-style foreground return was cheapest, but it could not overlap work or support queued/running cancellation. Luna sometimes described cancellation as if it happened despite having no cancellation operation, which strengthens the case for an explicit background contract.
- Minimal and reduced-Arhen background variants took the same number of turns in every matched scenario and had near-identical total input usage within stochastic noise.
- Minimal exposed roughly half the stable tool-schema bytes of reduced Arhen and represented queued/running cancellation correctly in the final verdicts.
- Completion must be delivered as a steering message before the next provider request. A first run using queued follow-up delivery produced stale notifications, duplicate launches, and repeated retrieval after the dynamic control tool had disappeared.

## Interpretation limits

- This is a contract-shape prototype, not reliability or adoption evidence.
- The official-style variant normalizes Pi’s foreground behavior but does not copy its subprocess runtime.
- The reduced Arhen-style variant copies lifecycle shape, not Arhen’s implementation or persistence.
- Token totals include repeated provider calls and therefore reflect both schema shape and the model’s chosen interaction path.

