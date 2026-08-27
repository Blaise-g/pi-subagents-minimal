# Luna quota pilot

One repetition of all four workflow scenarios at low, medium, and high Thinking. Review and simplification fan out, so 12 workflow trials produce 21 direct Subagent sessions. The frozen 3-repetition matrix projects to 36 workflow trials and 63 Subagent sessions.

| Thinking | Child role | Uncached input | Cached input | Output | Reasoning¹ | Total | API equivalent² | Time | Stop |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| high | exploration | 48,950 | 209,920 | 1,831 | 895 | 260,701 | $0.0162 | 89s | stop |
| high | research | 78,138 | 1,039,360 | 8,462 | 3,981 | 1,125,960 | $0.0466 | 263s | stop |
| high | review-spec | 7,875 | 0 | 1,995 | 1,247 | 9,870 | $0.0040 | 59s | stop |
| high | review-standards | 6,981 | 2,560 | 2,325 | 1,593 | 11,866 | $0.0042 | 66s | stop |
| high | simplify-efficiency | 8,753 | 0 | 989 | 546 | 9,742 | $0.0029 | 36s | stop |
| high | simplify-quality | 6,547 | 2,560 | 2,125 | 1,379 | 11,232 | $0.0039 | 59s | stop |
| high | simplify-reuse | 8,903 | 0 | 1,651 | 1,169 | 10,554 | $0.0038 | 54s | stop |
| low | exploration | 11,071 | 17,920 | 404 | 38 | 29,395 | $0.0031 | 46s | stop |
| low | research | 31,748 | 86,528 | 2,527 | 323 | 120,803 | $0.0111 | 94s | stop |
| low | review-spec | 4,787 | 1,536 | 883 | 188 | 7,206 | $0.0020 | 47s | stop |
| low | review-standards | 7,020 | 1,536 | 943 | 347 | 9,499 | $0.0026 | 49s | stop |
| low | simplify-efficiency | 5,694 | 0 | 599 | 209 | 6,293 | $0.0019 | 37s | stop |
| low | simplify-quality | 4,949 | 1,536 | 1,096 | 417 | 7,581 | $0.0023 | 48s | stop |
| low | simplify-reuse | 5,743 | 1,536 | 722 | 333 | 8,001 | $0.0020 | 33s | stop |
| medium | exploration | 23,669 | 20,992 | 942 | 328 | 45,603 | $0.0063 | 41s | stop |
| medium | research | 68,579 | 320,000 | 4,387 | 1,277 | 392,966 | $0.0254 | 130s | stop |
| medium | review-spec | 5,170 | 1,536 | 1,285 | 624 | 7,991 | $0.0026 | 45s | stop |
| medium | review-standards | 8,476 | 0 | 1,564 | 927 | 10,040 | $0.0036 | 45s | stop |
| medium | simplify-efficiency | 3,876 | 1,536 | 575 | 202 | 5,987 | $0.0015 | 37s | stop |
| medium | simplify-quality | 5,538 | 3,072 | 937 | 316 | 9,547 | $0.0023 | 41s | stop |
| medium | simplify-reuse | 8,656 | 6,144 | 885 | 408 | 15,685 | $0.0029 | 51s | stop |

¹ Reasoning is a subset of output, not an additional billed-token column.  
² Uses current official Luna rates: $0.20/M uncached input, $0.02/M cached input, and $1.20/M output.

## Observed pilot

- Sessions: 21
- Uncached input: 361,123
- Cached input: 1,718,272
- Output: 37,127
- Reasoning: 16,747
- Provider-reported total tokens: 2,116,522
- Official API-equivalent cost: $0.1511
- Sum of child wall times: 1,370 seconds

## Projected complete matrix (3× pilot)

- Sessions: 63
- Uncached input: 1,083,369
- Cached input: 5,154,816
- Output: 111,381
- Reasoning: 50,241
- Provider-reported total tokens: 6,349,566
- Official API-equivalent cost: $0.4534
- Serial-equivalent child time: 4,110 seconds

Pi 0.84.3's model registry estimated $3.7786 for the pilot and $11.3357 for the projection, but those values do not reflect current published Luna pricing and are not used.

## Limits

This measures direct child workloads before the v1 extension exists. It excludes parent-orchestration turns and lifecycle envelopes, and uses a compact seeded fixture. OpenAI Codex OAuth does not expose a subscription-quota meter in Pi's event stream, so tokens, time, and API-equivalent cost are measurable while exact subscription quota units are not.
