# Model and Thinking candidates for review Tasks

## Executive conclusion

The strongest locally supportable starting slate is the GPT-5.6 family, because the retained repository research contains first-party OpenAI positioning for all three tiers and first-party Thinking guidance, while the installed Pi 0.84.3 catalog confirms that the three models are represented under both `openai` and `openai-codex` and exposes their Thinking mappings.

For all five review Tasks, start with:

- **Quality-first:** `openai/gpt-5.6-sol` at `high`.
- **Balanced:** `openai/gpt-5.6-terra` at `medium`.
- **Cost-first:** `openai/gpt-5.6-luna`, generally at `medium`, with `low` as an adjacent-level challenger for the narrower Reuse Task.

Use the equivalent `openai-codex/...` identifier instead only when ChatGPT subscription authentication is the intended route and preflight confirms it is available. These are **recommendations to benchmark, not established winners**. In particular, do not promote `xhigh` or `max` without a measured quality gain, and do not infer model-output quality from the repository's deterministic qualification or its prior Sol/medium context measurement.

No current price is stated in this report. “Cost-first” is based on OpenAI's retained qualitative positioning of Luna as cost-sensitive/high-volume, not a claim about current rates or total workflow cost.

## Scope and evidence classes

This survey distinguishes:

1. **Current local documented facts:** what the installed Pi 0.84.3 documentation and generated catalog, and the current repository contract/workflow fixtures, say.
2. **Dated retained first-party facts:** first-party statements preserved in repository research snapshots, which may need freshness verification.
3. **Recommendations:** hypotheses for a one-off Recorded evaluation or Quality smoke.
4. **Open facts:** claims requiring fresh external first-party retrieval or the user's own benchmark and operating constraints.

No provider was contacted and no live model run was performed for this survey.

## What the review Tasks demand

The canonical workflow fixtures define five independent, report-only lenses, each using bounded `git_diff` plus local read tools:

| Task | Required judgment in the current fixture | Relative reasoning risk |
|---|---|---|
| Standards | Relate changes to repository standards and material smells; distinguish documented violations from judgment calls; suppress overridden/tool-enforced smells. | High breadth and false-positive risk. |
| Spec | Trace changed behavior to originating requirements; detect omissions, partial or incorrect implementation, and unrequested scope; cite both requirement and code evidence. | Highest requirement-traceability risk. |
| Reuse | Search for existing helpers, utilities, and nearby patterns that concretely replace duplicated changed code. | Narrower search/matching task, but repository breadth matters. |
| Quality | Judge avoidable complexity, abstraction leakage, parameter/state sprawl, near-duplication, stringly typing, nesting, and weak comments. | High subjective false-positive risk. |
| Efficiency | Identify material unnecessary work and explain impact while suppressing speculative micro-optimization. | High causal/impact-reasoning risk. |

Sources: `test/fixtures/parent-skills/code-review-diff.v0.2.0.md` and `test/fixtures/parent-skills/code-simplify.v0.2.0.md`.

The issue-40-linked normative contract confirms that these are supported review workflows and that each Task may select an exact `provider/model` and Pi Thinking level independently. Missing values inherit independently from the Orchestrator; unsupported or unauthenticated combinations must fail rather than be clamped or substituted. See `docs/spec/v1-implementation-contract.md`, especially §§1, 3.1, 5, 7, 13, and 14.2, linked to [issue #40](https://github.com/Blaise-g/pi-subagents-minimal/issues/40).

## Current local Pi/model facts

### Pi surface and catalog status

- The installed package is `@earendil-works/pi-coding-agent` version **0.84.3**: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json`.
- Pi defines Thinking levels `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Model-level `thinkingLevelMap` may map a Pi level to a provider value or mark it unsupported with `null`: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md`, “Thinking Level Map.”
- With no explicit map entry, Pi's model documentation says standard levels through `high` use the provider's default mapping, while `xhigh` and `max` require explicit support. Catalog holes are legal.
- Pi's built-in catalogs ship locally, but configured providers can refresh catalogs and cache newer data. Authentication determines actual availability: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md` and the “Providers & Models” section of `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/README.md`.
- Consequently, a generated catalog entry is evidence of what this Pi installation knows, **not proof of current provider availability, entitlement, behavior, or price**.

### GPT-5.6 entries in the installed generated catalog

The local generated source is rooted at:

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.generated.js`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/openai.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json`

Current local facts from those generated files:

- `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` exist under both `openai` and `openai-codex`.
- All three are marked reasoning-capable and tool-capable in the local metadata.
- Direct `openai/...` entries explicitly support `off` (mapped to provider `none`), `low`, `medium`, `high`, `xhigh`, and `max`; `minimal` is explicitly unsupported (`null`).
- `openai-codex/...` entries expose `xhigh` and `max`, and map Pi `minimal` to provider `low`; ordinary levels otherwise follow Pi's standard mapping behavior. Thus `minimal` is not a distinct lower-effort GPT-5.6 experiment on that route.
- The installed docs say direct GPT-5.6 entries default to a 272,000-token context setting, with an opt-in override for a larger context. Review Tasks should not assume that opt-in is needed; representative repository size should decide it: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md`, “Per-model Overrides.”

The generated files contain cost metadata, but it is intentionally not reproduced as current pricing here. It is a locally shipped catalog snapshot whose freshness and billing interpretation were not verified against provider pricing pages.

## Dated retained first-party facts

`docs/research/gpt-5-6-codex-subagent-guidance.md` is explicitly a **2026-08-26 research snapshot**. It retains these first-party OpenAI claims and URLs:

| Retained fact | First-party URL retained in the artifact |
|---|---|
| Luna is positioned for cost-sensitive, high-volume workloads. | [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) |
| Terra is positioned as a balance of intelligence and cost. | [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra) |
| Sol is positioned as the frontier tier for complex professional work. | [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol) |
| Preserve current effort as a migration baseline, test one level lower, use `medium` as balanced, use `low` for latency sensitivity, promote `high`/`xhigh` only when reasoning yields measured gains, and reserve `max` for the hardest quality-first work. | [GPT-5.6 model guidance](https://developers.openai.com/api/docs/guides/latest-model#update-api-and-model-parameters) |
| Pro mode should be benchmarked against standard mode rather than assumed superior. | [Pro mode guidance](https://developers.openai.com/api/docs/guides/latest-model#pro-mode) |
| Explicit spawn model/effort takes precedence over Codex defaults. | [Codex configuration reference](https://developers.openai.com/codex/config-reference) and retained source at OpenAI Codex commit [`f542017`](https://github.com/openai/codex/blob/f5420174dafba153913a3e697f89002c338dfd7e/codex-rs/config/src/config_toml.rs#L667-L711) |

These are stronger than generic catalog metadata because the artifact records first-party positioning. They are nevertheless dated facts, not proof that the linked pages, model identities, availability, or guidance remain unchanged now.

The same research artifact recommends Luna low/medium for narrow exploration, Terra medium for routine synthesis, and Sol medium/high for the hardest scenario. It expressly labels those uses as project hypotheses rather than OpenAI guarantees.

## Recommended candidate matrix

The exact provider prefix must match the user's available authentication. The table uses direct API identifiers for concreteness; substitute the same `openai-codex/...` model only after successful preflight and only when that route is operationally intended.

| Task | Quality-first candidate | Balanced candidate | Cost-first candidate | Why this is a credible test slate |
|---|---|---|---|---|
| Standards | `openai/gpt-5.6-sol`, `high` | `openai/gpt-5.6-terra`, `medium` | `openai/gpt-5.6-luna`, `medium` | Broad policy reconciliation and false-positive suppression justify a high-quality challenger; medium remains the documented balanced baseline. Keep Luna at medium initially because standards review is not merely lookup. |
| Spec | `openai/gpt-5.6-sol`, `high` | `openai/gpt-5.6-terra`, `medium` | `openai/gpt-5.6-luna`, `medium` | Requirement-to-code tracing has the highest completeness cost. `xhigh` is an escalation candidate only if Sol/high misses predeclared requirements. |
| Reuse | `openai/gpt-5.6-sol`, `high` | `openai/gpt-5.6-terra`, `medium` | `openai/gpt-5.6-luna`, `low` (also compare Luna/medium) | This is the narrowest lens and most directly matches retained Luna reconnaissance guidance. Adjacent low/medium comparison tests whether lower effort preserves repository search completeness. |
| Quality | `openai/gpt-5.6-sol`, `high` | `openai/gpt-5.6-terra`, `medium` | `openai/gpt-5.6-luna`, `medium` | Subjective simplification findings need evidence discipline and low false-positive rates; Luna/low is premature without evidence. |
| Efficiency | `openai/gpt-5.6-sol`, `high` | `openai/gpt-5.6-terra`, `medium` | `openai/gpt-5.6-luna`, `medium` | Materiality and causal impact require more than pattern spotting. Test Luna/low only after medium demonstrates acceptable impact reasoning. |

### Configuration policy recommendations

1. **Do not hard-code one package default by lens yet.** The contract deliberately permits per-Task model and Thinking selection; retained OpenAI guidance says to evaluate rather than assume stronger settings help.
2. **Use Terra/medium as the first shared baseline.** It directly follows retained first-party “balance” and “medium” positioning and keeps the comparison interpretable.
3. **Compare one dimension at a time.** For example, Terra/medium versus Terra/low isolates Thinking; Terra/medium versus Luna/medium isolates model tier.
4. **Escalate quality-first gradually.** Sol/high is a credible first quality challenger. Compare Sol/medium versus Sol/high before any `xhigh`; reserve `max` for a demonstrably difficult fixture where lesser levels miss important findings.
5. **Avoid Pi `minimal` for GPT-5.6 comparisons.** It is unsupported on direct OpenAI and aliases to `low` in the installed Codex catalog, so it does not provide a clean adjacent-effort experiment.
6. **Record effective values.** The contract's Terminal envelope records `effectiveModel` and `effectiveThinking`; retain those with the exact Task, source commit, model/catalog version, output, and rubric.

## Cross-provider candidates: locally present, not yet evidence-backed recommendations

The installed Pi catalog also contains current local entries such as Anthropic Claude Opus/Sonnet/Haiku and Google Gemini Pro/Flash variants:

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/anthropic.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/google.json`

They are credible **benchmark-challenger families** because Pi presently represents reasoning-capable, tool-capable models from those providers. However, the inspected repository artifacts do not retain sufficiently current first-party quality positioning for the locally listed Anthropic or Google model generations. Catalog names, context limits, Thinking maps, and cost metadata alone do not establish which model is quality-first, balanced, or cost-first for these review Tasks.

Therefore this report does **not** assign them to the three recommendation tiers. Before doing so, retrieve current first-party model cards/guides, supported Thinking semantics, tool-use constraints, lifecycle/preview status, and pricing, then run the same task-level rubric. This avoids laundering Pi catalog metadata into an unsupported quality claim.

## Benchmark input needed from the user

The candidate ranking cannot be resolved from documentation alone. A useful user-supplied benchmark should provide:

- representative diffs for each of Standards, Spec, Reuse, Quality, and Efficiency;
- repository standards and an originating specification for applicable fixtures;
- a human-reviewed finding set or, at minimum, predeclared must-find and must-not-flag cases;
- the relative penalty for missed defects versus false positives;
- acceptable latency and budget per Task or per five-Task batch;
- intended provider/auth route (`openai`, `openai-codex`, or another provider) and any data-handling constraints;
- typical and worst-case repository/context size;
- whether cost means API token spend, subscription quota pressure, wall-clock time, total tokens/tool calls, or a weighted combination.

Suggested per-lens criteria:

| Task | Primary quality criteria |
|---|---|
| Standards | Controlling-standard accuracy; suppression of overridden/tool-enforced smells; actionable evidence; false-positive count. |
| Spec | Requirement coverage; omission/partial-implementation detection; no invented requirements; exact requirement/code citations. |
| Reuse | Existing replacement really exists and fits; search completeness; concrete simplification; no vague “could refactor” findings. |
| Quality | Material complexity reduction; evidence and concrete change; judgment-call labeling; false-positive rate. |
| Efficiency | Demonstrable material work/impact; causal explanation; concrete fix; suppression of speculative micro-optimization. |

Measure quality first. Only among configurations that clear the quality threshold should latency, usage, and cost decide “balanced” or “cost-first.”

## Evaluation and release-policy constraints

`docs/adr/0001-keep-model-evaluation-outside-release-automation.md` states that provider runs are probabilistic, availability-dependent, slow, and costly; model-output quality should therefore be assessed only through a one-off Recorded evaluation or Quality smoke when warranted, retained for human review, and never made a scheduled CI job or mechanical release gate.

The normative `docs/spec/v1-implementation-contract.md` §14.2 repeats that deterministic release qualification makes no certified claim about any provider, model, Thinking level, prompt, or trial matrix. The issue-40 contract permits optional evidence designed for a concrete question but supersedes the old Behavioral battery as a release gate.

`docs/dogfood-qualification.json` further records that no provider-backed model evaluation was collected for the reviewed 0.2.0 candidate because no unresolved behavior question then justified one. This ticket creates a candidate slate; it does not retroactively create qualification evidence.

Two retained runs must not be misread as quality evidence:

- `docs/research/context-cost-measurement.md` used `openai-codex/gpt-5.6-sol` at medium on 2026-08-26 to measure parent-facing context overhead, not review quality.
- `docs/spec/v1-implementation-contract.md` §13 names `openai-codex/gpt-5.6-sol` at medium in a context-budget token protocol, again not as a quality recommendation.

## Facts requiring fresh external primary-source retrieval

Before adopting or publishing a current recommendation, retrieve and retain:

1. Current OpenAI model pages for Luna, Terra, and Sol, confirming model status and positioning.
2. Current GPT-5.6 effort/Thinking guidance, including exact supported effort values and whether defaults changed.
3. Current provider-specific availability and authentication/entitlement behavior for both OpenAI API and ChatGPT Codex routes.
4. Current first-party pricing pages and billing semantics, including cached input, long-context tiers, reasoning-token treatment, subscription quotas, and whether the two routes are economically comparable. **No current price has been inferred here.**
5. Current first-party model facts for any Anthropic, Google, or other cross-provider challenger before labeling it quality-, balance-, or cost-oriented.
6. Any deprecation, preview, fallback, routing, or alias behavior that could make exact model identity nondeterministic.
7. Current tool-use and context-window limitations relevant to `git_diff` payloads and repository reads.

## Source inventory

### Normative and repository-local

- `docs/spec/v1-implementation-contract.md` — sole normative implementation handoff; issue #40 linkage; exact model/Thinking selection, preflight, runtime isolation, Terminal evidence, context protocol, and evaluation policy.
- `docs/adr/0001-keep-model-evaluation-outside-release-automation.md` — evaluation policy.
- `docs/research/gpt-5-6-codex-subagent-guidance.md` — dated retained first-party GPT-5.6 and Codex facts and recommendation hypotheses.
- `test/fixtures/parent-skills/code-review-diff.v0.2.0.md` — exact Standards and Spec Task shapes.
- `test/fixtures/parent-skills/code-simplify.v0.2.0.md` — exact Reuse, Quality, and Efficiency Task shapes.
- `docs/dogfood-qualification.json` — records absence of provider-backed evaluation for 0.2.0.
- `docs/research/context-cost-measurement.md` — dated Sol/medium context-cost measurement, explicitly not workflow quality.
- `docs/spec/v0.2-generic-subagent-capabilities-proposal.md` §16 — historical proposed one-off evaluation shapes; non-normative where it differs from the canonical contract.

### Installed Pi 0.84.3 documentation and source

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/README.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/models.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/providers.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/models.generated.js`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/openai.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/anthropic.json`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/data/google.json`

## Bottom line

Adopt **Terra/medium as the baseline**, challenge it with **Sol/high for quality** and **Luna medium/low for cost-sensitive operation**, and resolve the winner separately for each review lens using the user's representative diffs and predeclared rubric. Treat `xhigh`/`max`, cross-provider candidates, and every pricing claim as open until fresh primary-source retrieval and benchmark evidence justify them.