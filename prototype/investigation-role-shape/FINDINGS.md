# Directional findings

All eight runs produced materially correct answers with the requested evidence and no file changes. The combined definition therefore showed no quality failure that requires separate roles in this sample. It was less efficient, especially on narrow exploration.

| Task | Combined tools / input / output | Specialized tools / input / output |
|---|---:|---:|
| Locate skill merge | 13 / 33,809 / 1,050 | 8 / 17,315 / 709 |
| Trace tool selection | 19 / 44,576 / 1,554 | 17 / 19,638 / 1,312 |
| Establish skill loading | 24 / 39,027 / 2,162 | 21 / 54,725 / 2,454 |
| Establish session isolation | 59 / 52,254 / 4,760 | 43 / 57,183 / 3,511 |
| **Total** | **115 / 169,666 / 9,526** | **89 / 148,861 / 7,986** |

Usage totals sum every assistant message's reported input/output tokens and therefore include repeated context across turns. They are useful for matched directional comparison, not a parent Added context cost measurement.

## Verdict

Prefer one package-owned **Investigation** definition for v1 because the product goal is one minimal context-offloading primitive and the sample found no material correctness loss. Keep the combined definition leaner than the tested draft and default it to narrow inspection; task prompts explicitly request deeper sourcing, citations, or a report when needed. Expose only task-relevant capabilities, especially the optional restricted report writer.

This is a product-surface choice, not evidence that one role is intrinsically more token-efficient. The specialized definitions used 26 fewer tool calls and about 14% fewer summed input tokens in this single stochastic run. The frozen behavioral battery should retain both quick exploration and evidence-intensive scenarios so a future split is driven by measured failure rather than taxonomy.

## OpenAI grounding

OpenAI's GPT-5.6 guidance recommends lean prompts, stating each instruction once, exposing only task-relevant tools, and testing model/effort changes on representative tasks. It recommends `medium` as a balanced effort baseline, `low` for latency-sensitive work, and `high`/`xhigh`/`max` only when measured quality warrants them. It positions Luna for efficient high-volume work, Terra for cost/capability balance, and Sol for frontier capability: <https://developers.openai.com/api/docs/guides/latest-model>.

OpenAI's Multi-agent guide recommends delegation for independent bounded workstreams and focused contexts, but not for small sequential work or shared mutable state. The hosted Responses Multi-agent beta gives all agents the request's same model and tools: <https://developers.openai.com/api/docs/guides/responses-multi-agent>.

Codex itself separately supports global spawned-agent model/effort defaults with explicit spawn overrides taking precedence: <https://developers.openai.com/codex/config-reference>. This is the closer precedent for v1's model-selection contract.
