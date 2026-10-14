# badlogic subagent context cost

Measured **2026-10-14** on **Pi 1.2.0**, Node **26.10.0**, `openai-codex/gpt-6.1-sol`, medium thinking. Upstream revision: [`4fc1fe5178d1a2b474794a5ee39e7295844e9d3c`](https://github.com/earendil-works/pi-subagent/tree/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c).

## Result

**Idle overhead was 72 input tokens.** Loading the full operational skill added another **1,090 tokens** in the explicit skill-invocation probe. The extension added **zero tool-schema bytes**: it exposes a CLI and an interactive command rather than a model-facing subagent tool. Both runs of every condition produced identical input-token counts.

| Fresh-request condition | Input tokens, run 1 | Input tokens, run 2 | Difference from installed-but-idle condition |
| --- | ---: | ---: | ---: |
| No subagent extension | 2,494 | 2,494 | −72 |
| Extension loaded, skill only advertised | 2,566 | 2,566 | — |
| Extension plus explicit `/skill:subagent` invocation | 3,656 | 3,656 | +1,090 |
| Extension plus the review result attached as a text file | 2,876 | 2,876 | +310 |

The last two conditions were measured separately, not combined. Skill invocation uses Pi's skill-expansion wrapper; reading the file through `read` uses a different transcript wrapper. The report attachment is likewise a text-inclusion probe, **not an exact measurement of the actual parent `bash` tool-result framing**. It shows the scale of the returned text without attributing the entire child conversation to the parent.

The idle system prompt grew from **8,245 to 8,560 characters**, exactly **315 characters**. A prompt diff showed only the skill descriptor (name, description, absolute path) was added. Serialized provider tool declarations were identical in all eight requests: **3,101 UTF-8 bytes**, SHA-256 `3d3886d503ab8e1d49babf5500da267402fb4e5558d87daeebdcdf4979862083`.

## Actual delegation trial

A read-only child named `migration-review` reviewed the migration documents and the external research skill against installed upstream source. It used `read,grep,find,ls`, inherited the current model/thinking, and returned a report with no findings. Its inability to inspect Git diff hunks without shell access was explicitly reported; it inspected current complete files instead.

- Five assistant turns in the child's own session.
- Final child request input: **26,205 tokens**, including **23,552 cached** and **2,653 uncached** tokens.
- Cumulative child input across all five requests: **74,547 tokens**. This is repeated processing/billing volume, **not** one context-window size.
- Cumulative child output: **1,095 tokens**; final report generation: **284 output tokens**, with no reasoning tokens on that final turn.
- `subagent wait` returned **1,182 UTF-8 bytes / 1,176 characters**, including its short completion header and trailing newline.
- The parent received that final report, not the child's file-read transcript. Parent spawn/wait calls and any diagnostic output also consume context; the 72-token idle measurement does not include this experiment's own conversation.

The child was stopped after collecting its report and usage. `subagent list` then returned `No subagents`.

The review report is preserved verbatim below. This was a bounded documentation trial, not certification of upstream lifecycle behavior or model review quality.

### Returned review

## Correctness
none.

## Standards
none.

## Spec
**Met (documentation):** “i like the badlogic one lets switch to use its versions! anything that i would need to change in my workflows or not?”

`README.md` and ADR 0003 select the upstream revision and explain tmux, CLI installation, explicit result collection, report preservation before stopping, and suspend/resume behavior. These match installed `subagent.ts` (`waitSubagent`, `stopSubagent`), `index.ts` lifecycle handlers, and `shared.ts`. The external research skill requires retaining the handle, explicitly waiting, and verifying the saved report. No independently rerun installation or model smoke tests are claimed.

Examined: README.md; AGENTS.md; docs/adr/0003-replace-local-runtime-with-task-first-extension.md; /Users/lorenzogermini/.pi/agent/skills/research/SKILL.md; /Users/lorenzogermini/.pi/agent/extensions/subagent/{README.md,subagent.ts,index.ts,shared.ts,skills/subagent/SKILL.md}. Not examined: diff hunks against c43aa0ce18255fc586c44c0ec726e7ec1fc1764b—Git diff execution unavailable under the read/grep/find/ls-only restriction; reviewed complete current scoped contents instead.

## Protocol and reproduction

This follows the provider-recording approach in [the earlier context-cost measurement](context-cost-measurement.md), but uses the current host and model. Its numbers are not directly comparable with the earlier model's measurements.

All eight probes ran from the same temporary workspace, with fresh in-memory sessions, default built-in tools, ordinary global skill discovery, no context files, no prompt templates, and no other extensions. Disabling other extensions keeps the comparison controlled; it does not reproduce the full production system prompt. Neither global settings nor upstream source were changed for measurement.

Each request used `Reply with exactly OK. Do not call tools or launch children.` The skill condition prepended `/skill:subagent`; the report condition additionally attached the exact `wait` text as a file. Every response contained only `OK`, completed normally, and had no stderr diagnostics. Provider usage was recorded from the final assistant message, using `usage.input + usage.cacheRead` for total input context; all eight probes had zero cached input.

A temporary recorder extension captured the rendered prompt and provider request before sending:

```ts
import { writeFileSync } from "node:fs";
export default function (pi: any) {
  pi.on("before_agent_start", (event: any) => {
    writeFileSync(process.env.CONTEXT_RECORD + ".prompt.json", JSON.stringify({
      systemPrompt: event.systemPrompt, prompt: event.prompt,
    }));
  });
  pi.on("before_provider_request", (event: any) => {
    writeFileSync(process.env.CONTEXT_RECORD + ".payload.json", JSON.stringify(event.payload));
  });
}
```

Baseline command, from a temporary directory with the recorder saved at an absolute path:

```sh
CONTEXT_RECORD=/tmp/baseline pi --offline --no-extensions \
  --extension /absolute/path/to/recorder.ts \
  --no-context-files --no-prompt-templates --no-session \
  --provider openai-codex --model gpt-6.1-sol --thinking medium \
  --mode json --print 'Reply with exactly OK. Do not call tools or launch children.'
```

For the extension condition, additionally pass `--extension ~/.pi/agent/extensions/subagent/index.ts`. For the skill condition, use the same extension arguments and prefix the prompt with `/skill:subagent `. For the report condition, use the extension arguments and additionally pass `@/absolute/path/to/review-response.txt` containing the collected `wait` text. Repeat each condition with a fresh session and distinct `CONTEXT_RECORD` prefix.

Raw local captures and the exact review-task prompt were left at `/tmp/pi-subagent-context.3WeVqB`; they are temporary evidence, not a durable repository dependency. This note preserves the numeric results, schema fingerprint, returned review, and reproduction method. No executable repository files were added or changed.

## Interpretation and limits

- The **idle descriptor** occupies context whenever it is included; it is not a one-time installation charge. Prompt caching can change billing without removing occupied context.
- The **full skill** is on-demand conversation content. It need not be reread for every child; transcript retention/compaction determines how long it remains.
- The **child conversation** uses a separate context window and still consumes provider quota. Delegation reduces parent context growth, not total model usage to zero.
- The **returned report** grows parent context in proportion to its length; requesting concise findings keeps that return small.
- Counts depend on model/tokenizer, installed revision, absolute paths, skill discovery, and transcript framing. These results establish this measured configuration, not a universal token count or a comparison against nijaru on the same model.

Primary implementation references: [skill discovery and parent UI](https://github.com/earendil-works/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/index.ts), [CLI spawn/wait](https://github.com/earendil-works/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/subagent.ts), [active-branch final response extraction](https://github.com/earendil-works/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/shared.ts), and [bundled skill](https://github.com/earendil-works/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/skills/subagent/SKILL.md).
