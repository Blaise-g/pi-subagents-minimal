# GPT-5.6 and Codex guidance for minimal Subagents

_Research snapshot: 2026-08-26. Supporting asset for [Place research and exploration instructions](https://github.com/Blaise-g/pi-subagents-minimal/issues/5). This records reusable primary-source findings; it does not make OpenAI's hosted Multi-agent runtime normative for this Pi extension._

## Conclusions to carry into the specification

1. Let the Orchestrator select an exact model and Pi **Thinking level** per task. An explicit task choice overrides inherited defaults; validate it before starting and report the effective selection.
2. Do not implement an automatic model router in v1. Start from representative workflow evaluations, compare the same configuration and one lower Thinking level, and promote stronger settings only for measured quality gains.
3. Keep the Investigation definition and parent-facing tool guidance lean: state each instruction once, expose only task-relevant tools, and preserve explicit scope, evidence, approval, and success criteria.
4. Delegate bounded, independent work that benefits from a separate context. Prefer one agent for a small task, an ordered reasoning chain, one slow external operation, or writes to shared mutable state.
5. Treat Codex CLI's explicit spawn-over-default behavior as the closer precedent for heterogeneous per-task model selection. OpenAI's hosted Responses Multi-agent beta instead gives every agent the request's same model and tools.

## GPT-5.6 model and Thinking selection

OpenAI positions the current GPT-5.6 tiers as:

| Model | Official positioning | Suggested hypothesis to test here |
|---|---|---|
| [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna) | Cost-sensitive, high-volume workloads | Narrow lookup and high-volume reconnaissance |
| [`gpt-5.6-terra`](https://developers.openai.com/api/docs/models/gpt-5.6-terra) | Balance of intelligence and cost | Default investigation and routine synthesis |
| [`gpt-5.6-sol`](https://developers.openai.com/api/docs/models/gpt-5.6-sol) | Frontier model for complex professional work | Difficult or high-value synthesis and review |

The hypotheses are project recommendations, not OpenAI guarantees. All three model pages currently list `none`, `low`, `medium` (default), `high`, `xhigh`, and `max` reasoning effort. Pi calls this setting **Thinking level**.

The [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model#update-api-and-model-parameters) says to preserve the current effort as a migration baseline and test one level lower. It describes `medium` as balanced, `low` as latency-sensitive, `high`/`xhigh` as appropriate when more reasoning produces a measured gain, and `max` as reserved for the hardest quality-first workloads. The same guide says Pro mode should be benchmarked against standard mode rather than assumed superior ([Pro mode](https://developers.openai.com/api/docs/guides/latest-model#pro-mode)).

**Implication:** v1 should expose optional `model` and `thinking` task fields rather than encode fixed choices in the Agent definition. The fallback is the Orchestrator's active model and Thinking level. A Flat batch may choose independently per task. Unsupported or unauthenticated combinations fail preflight rather than silently changing.

## Reusable GPT-5.6 prompting guidance

The official guide's [Favor leaner prompts](https://developers.openai.com/api/docs/guides/latest-model#favor-leaner-prompts) section recommends:

- start with a working prompt/tool set and remove one instruction or tool group at a time;
- rerun the same evaluations after each change;
- state every instruction once;
- expose only tools relevant to the task;
- retain examples and style rules only when they encode a requirement or correct a measured gap;
- track context both initially and as a session grows.

OpenAI reports a directional internal coding-agent sample in which leaner system prompts improved scores by roughly 10–15%, reduced total tokens by 41–66%, and reduced cost by 33–67%. OpenAI explicitly says results vary by workload, so these figures are motivation to evaluate—not a transferable performance claim.

The guide's [Define autonomy and approval boundaries](https://developers.openai.com/api/docs/guides/latest-model#define-autonomy-and-approval-boundaries) section recommends one compact policy that distinguishes inspect/report requests from authorized changes and names safe actions explicitly. Repeating prohibition language can cause unnecessary approval requests.

The [response-length guidance](https://developers.openai.com/api/docs/guides/latest-model#set-response-length-and-style) recommends specifying what a short answer must preserve: conclusion, supporting evidence, material caveat, and next action; trim introductions, repetition, reassurance, and optional background first.

**Implication for the Investigation definition:** default to the narrow answer, preserve evidence and caveats, omit search narration, never infer mutation authority, and activate deeper sourcing or report creation only when the task asks for it.

## OpenAI Multi-agent guidance

OpenAI's hosted [Multi-agent guide](https://developers.openai.com/api/docs/guides/responses-multi-agent) says separate contexts help reduce interference between unrelated workstreams. It recommends Multi-agent for independent bounded work such as exploring separate code areas, comparing proposals, researching sources, independent implementation/tests, or investigating distinct failure hypotheses. It recommends one agent when steps are sequential, the task is short, agents would contend over mutable state, or a fixed deterministic graph is required.

The hosted beta:

- gives root and Subagents the same request model and available tools;
- defaults to and recommends three concurrent Subagents for most workloads;
- permits nested delegation and coordination actions;
- warns that Subagents can increase token use and may not help when one external operation dominates.

Only the bounded-task and focused-context principles transfer to this project. V1 intentionally excludes nested delegation, shared mutable writes, steering, and general orchestration. Its explicit per-task model/Thinking selection is not copied from the hosted Responses beta.

## Codex CLI precedent

The official [Codex configuration reference](https://developers.openai.com/codex/config-reference) defines `agents.default_subagent_model` and `agents.default_subagent_reasoning_effort` as defaults, with an explicit spawn model or effort taking precedence. It also permits named role declarations backed by role-specific configuration files.

The current official source says the same at OpenAI Codex commit [`f542017`](https://github.com/openai/codex/blob/f5420174dafba153913a3e697f89002c338dfd7e/codex-rs/config/src/config_toml.rs#L667-L711):

- spawned-agent concurrency is configurable;
- default model and reasoning effort apply only when the spawn call does not select them;
- named roles carry human-facing descriptions and a role-specific config path.

**Implication:** use exact per-task overrides over defaults, but do not import Codex's broader role catalog or nested multi-agent lifecycle. Package-owned exact Agent-definition selection is enough for v1.

## Verification consequences

A future one-off evaluation designed for these questions could compare:

- Luna/low or medium for narrow exploration;
- Terra/medium for routine evidence synthesis;
- Sol/medium and Sol/high for the hardest validated scenario;
- the same model at adjacent Thinking levels before claiming a higher level helps;
- one Investigation versus a Flat batch only on genuinely independent work;
- concise direct return versus report-pointer return;
- task-relevant tools versus an unnecessarily broad tool set.

Define correctness criteria before measuring input/output tokens, tool calls, latency, and cost. Lower resource use counts as an improvement only if the answer retains required evidence and completeness, matching OpenAI's evaluation advice.

## Related local evidence

The directional [Investigation role-shape prototype](https://github.com/Blaise-g/pi-subagents-minimal/tree/983b4b1b4af0bb9db656e45cd1bfdd3ad3f8ea8d/prototype/investigation-role-shape) found no material correctness difference between one combined definition and separate Research/Exploration definitions in four matched tasks. In that single stochastic run, specialized definitions used 26 fewer tool calls and about 14% fewer summed child input tokens. This supports keeping one lean v1 definition; future one-off evaluations can include both task shapes when relevant.
