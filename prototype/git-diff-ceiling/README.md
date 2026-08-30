# PROTOTYPE — Git-diff model-visible ceiling

Question: with fixed representative large-diff fixtures and matched review Tasks, how do 50 KiB and 80 KiB model-visible `git_diff` ceilings affect evidence completeness, follow-up calls, findings, tokens, latency, and cost?

## Protocol

- `openai-codex/gpt-5.6-luna`, high Thinking
- Standards and Spec review lenses
- broad fixture over 80 KiB and threshold fixture in the 50–80 KiB range
- two repetitions per lens and fixture; eight matched pairs / sixteen runs
- current 80 KiB implementation versus a prototype wrapper retaining the longest valid UTF-8 prefix at 50 KiB with an explicit incompleteness notice

Run `bun prototype/git-diff-ceiling/run.ts`, then `bun prototype/git-diff-ceiling/analyze.ts`. Open `index.html` directly for the result walkthrough.

## Result

Every run at both ceilings found the seeded material defects: absent validation, malformed-record acceptance, swallowed parse errors, and repeated waste. No material finding depended on 80 KiB.

| Mean across 8 runs | 50 KiB | 80 KiB |
|---|---:|---:|
| `git_diff` calls | 14.88 | 16.88 |
| file reads | 10.38 | 8.00 |
| cumulative tokens | 258,384 | 152,706 |
| latency | 69.8 s | 67.0 s |
| provider cost | $0.02350 | $0.01939 |

## Counterbalanced diagnostic follow-up

Because the initial runs always executed 50 KiB before 80 KiB and a few long 50 KiB trajectories dominated the mean, `run-diagnostic.ts` repeated Broad Standards and Threshold Spec four times each, alternating which ceiling ran first and retaining per-turn call and usage summaries.

| Mean across 8 diagnostic runs | 50 KiB | 80 KiB |
|---|---:|---:|
| turns | 7.50 | 8.25 |
| `git_diff` calls | 16.00 | 15.88 |
| file reads | 8.63 | 8.38 |
| cumulative tokens | 168,331 | 183,466 |
| latency | 62.0 s | 64.9 s |
| provider cost | $0.01901 | $0.01987 |

Every diagnostic run still found the seeded material defects. The apparent direction reversed: 50 KiB was slightly cheaper, while calls and reads were effectively tied. Both ceilings used fewer tokens when they ran second, exposing an order/cache confound. Individual trajectories varied much more than the ceiling means.

## Verdict

The prototype does **not** establish a material quality, call-count, token, latency, or cost advantage for either ceiling. The initial apparent 50 KiB penalty was caused by stochastic long trajectories plus fixed execution order, not reliably by the smaller result.

For the downstream ceiling decision, treat efficiency as equivalent in this evidence. Retain 80 KiB only as a robustness choice—more evidence is available in one call with no demonstrated workflow penalty—not because this prototype proves it cheaper.

This is directional Recorded-evaluation evidence, not CI or release qualification. Tool-call behavior was stochastic, the fixtures were synthetic, direct isolated Pi reviewers approximated Subagent review Tasks, and the 50 KiB wrapper truncated the rendered output rather than implementing a candidate metadata/patch allocator.
