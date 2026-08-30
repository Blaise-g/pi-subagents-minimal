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

## Verdict

Keep 80 KiB. Reducing the ceiling preserved findings but did not improve the measured behavior: it used 69% more cumulative tokens, 21% more file reads, 4% more latency, and 21% more provider cost. The lower mean `git_diff` count at 50 KiB did not translate into less overall evidence work.

This is directional Recorded-evaluation evidence, not CI or release qualification. Tool-call behavior was stochastic, the fixtures were synthetic, direct isolated Pi reviewers approximated Subagent review Tasks, and the 50 KiB wrapper truncated the rendered output rather than implementing a candidate metadata/patch allocator.
