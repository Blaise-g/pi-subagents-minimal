# Candidate Added Context Cost

Measurement for [Measure candidate added-context costs](https://github.com/Blaise-g/pi-subagents-minimal/issues/3), run 2026-08-26 with Pi 0.84.3, provider `openai-codex`, model `gpt-5.6-sol`, medium reasoning, and the same fresh temporary project for every run.

## Protocol

Each run used a fresh `pi --no-session --mode json` invocation with the prompt `Reply with exactly OK.`. The no-package baseline loaded Pi's default tools. Each candidate was loaded as one extension from its published npm tarball. A temporary recorder extension captured `before_agent_start.systemPrompt` and `before_provider_request.payload`; the final `message_end` supplied observed input tokens. JSON byte counts use compact `JSON.stringify`-equivalent serialization. The same command was repeated once for each condition and produced identical values.

This measures parent-facing context registration, not package download size, startup time, child-session context, or workflow quality. Provider token accounting is model/provider-specific; the payload and prompt measurements make the comparison auditable.

## Results

| Condition | Tool names added | Serialized `tools` payload | Added tool payload | System prompt | Added prompt text | Observed input tokens | Delta vs baseline |
|---|---|---:|---:|---:|---:|---:|---:|
| No package | — | 3,996 B | — | 6,499 chars | — | 2,196 | — |
| Nico Bailon `pi-subagents@0.57.0` | `subagent`, `subagent_wait`, `subagent_supervisor` | 22,849 B | **18,853 B** | 7,838 chars | **1,339 chars** | 5,947 | **+3,751** |
| Tintinweb `@tintinweb/pi-subagents@0.18.2` | `Agent`, `get_subagent_result`, `steer_subagent` | 14,883 B | **10,887 B** | 7,651 chars | **1,152 chars** | 4,613 | **+2,417** |
| Arhen `@arhen/pi-core-subagent@1.3.46` | `subagent`, `subagent_status`, `subagent_result`, `await_subagent`, `reply_subagent`, `steer_subagent`, `subagent_cancel` | 12,204 B | **8,208 B** | 9,633 chars | **3,134 chars** | 4,360 | **+2,164** |

The baseline's six tools were `read`, `bash`, `edit`, `write`, `web_search`, and `fetch_content`; these remain included in every candidate run. Arhen has the smallest added serialized tool payload, while Tintinweb has the smallest added prompt text. Nico has the largest cost on both measured surfaces. Input-token deltas track the combined additions but are not interchangeable with either byte count.

## Reproduction

The temporary recorder was:

```ts
import { writeFileSync } from "node:fs";
export default function (pi: any) {
  pi.on("before_agent_start", (e: any) => writeFileSync(process.env.RECORD!, JSON.stringify({systemPrompt:e.systemPrompt, options:e.systemPromptOptions})));
  pi.on("before_provider_request", (e: any) => writeFileSync(process.env.RECORD2!, JSON.stringify(e.payload)));
}
```

Run it with the baseline or candidate extension:

```sh
RECORD=/tmp/baseline.record RECORD2=/tmp/baseline.payload \
  pi --no-session --mode json -e /tmp/recorder.ts -p 'Reply with exactly OK.'
```

Replace the recorder-only invocation with `-e` pointing to the candidate extension. The package tarballs were obtained with `npm pack` at the versions shown above; no source changes were made.
