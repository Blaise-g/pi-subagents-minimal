# Quota pilot findings

## Question

Would the proposed 36-trial provider-backed workflow matrix be cheap enough—in tokens, time, and money—to run on every CI change?

## Method

A direct-child pilot ran one repetition of all four frozen workflow shapes at low, medium, and high Thinking on `openai-codex/gpt-5.6-luna`. Review used two independent child roles and simplification used three, so the pilot comprised 12 workflow trials and 21 fresh Subagent sessions. Every run used Pi 0.84.3 with sessions, extensions, skills, templates, themes, and context files disabled. Investigation ran against the installed Pi 0.84.3 package; review and simplification ran against the captured seeded fixture.

The proposed three-repetition matrix is exactly three times this cell structure: 36 workflow trials and 63 Subagent sessions. The projection multiplies observed usage and serial-equivalent child time by three; it does not claim that stochastic usage will be identical.

## Result

The 21-session pilot consumed:

- 361,123 uncached input tokens
- 1,718,272 cached input tokens
- 37,127 output tokens, including 16,747 reasoning tokens
- 2,116,522 provider-reported total tokens
- 1,370 seconds of summed child wall time
- $0.1511 at current official Luna API rates

The projected 63-session matrix is:

- 1,083,369 uncached input tokens
- 5,154,816 cached input tokens
- 111,381 output tokens, including about 50,241 reasoning tokens
- 6,349,566 provider-reported total tokens
- 4,110 seconds (68.5 minutes) of serial-equivalent child time before parent orchestration
- $0.4534 at current official Luna API rates

Actual elapsed time can be reduced by the selected four-slot concurrency. The projection excludes Orchestrator turns and the extension lifecycle envelopes because v1 is not implemented yet.

The evidence-intensive research cell dominated variance: its high-Thinking run alone consumed 1,125,960 total tokens and 263 seconds. This is exactly why a money-only CI decision would be misleading: Luna's API-equivalent cost is low, but subscription quota and feedback time may not be.

Pi 0.84.3's embedded model registry reported $3.7786 for the pilot and projects $11.3357, but that registry does not reflect current published Luna rates of $0.20/M uncached input, $0.02/M cached input, and $1.20/M output. Those stale estimates are retained in the normalized results but rejected for the cost decision.

## Limit

OpenAI Codex OAuth does not expose a subscription-quota meter in Pi's JSON event stream. Exact subscription quota units therefore cannot be measured here. Tokens, time, and current API-equivalent cost are the reproducible proxies. CI authentication and quota isolation also remain packaging concerns.

## Recommendation

Do not run the full 36-trial provider-backed matrix on every CI change. Its monetary cost is negligible, but roughly 6.35M total tokens, high stochastic variance, external credentials, and release-scale latency make it a poor per-change gate.

Use three layers:

1. Deterministic lifecycle and frozen-fixture oracle tests on every CI change.
2. One low-Thinking smoke repetition of each workflow (7 Subagent sessions) only on relevant opt-in CI or a scheduled/manual job.
3. The complete 36-trial matrix before release and after material changes to the Agent definition, workflow prompts/fixtures, Pi child runtime, model id, Thinking mapping, or participating review skills.

The exact smoke cadence is a HITL decision; this prototype supplies the cost evidence rather than deciding it.

Full normalized results and compressed Pi event streams are under [`results/`](results/).
