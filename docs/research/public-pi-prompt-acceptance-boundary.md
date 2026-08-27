# Public Pi 0.84.3 prompt-acceptance boundary

**Research question:** Which documented public Pi 0.84.3 API or event can establish child-prompt acceptance and rejection without relying on `PromptOptions.preflightResult`, while preserving distinct Setup and Running deadlines?

## Answer

Pi 0.84.3 has **no single in-process `AgentSession` API or event that reports both positive prompt acceptance and pre-acceptance rejection**. The only single documented public boundary with both outcomes is the **RPC `prompt` command response**: `success: true` means accepted, queued, or handled, and `success: false` means rejected before acceptance. Using that boundary would replace the contract's in-process `createAgentSession()` child with an RPC transport/subprocess, contrary to the frozen child-runtime design, so it is not the least disruptive correction.

For the existing in-process design, the least ambiguous public contract is a composite boundary: keep the child in **Setup** until the first invocation-bound public `agent_start` event; that event atomically moves it to **Running** and starts the Running deadline. If `session.prompt()` throws or its promise rejects before that event, classify the child as setup-stage `PROMPT_REJECTED`; after that event, a rejection is run-stage `RUN_FAILED`. This uses only the public `prompt()` promise and public `AgentSessionEvent` subscription.

## Scope and source status

The inspected installed artifact identifies itself as `@earendil-works/pi-coding-agent` 0.84.3 and exposes its main declarations through `dist/index.d.ts` (`/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json:1-24`). The matching official tag is `v0.84.3` at commit `4e58f324fae8ebfa98a3d45181fb248072a2afac`. Sources below are the installed 0.84.3 docs/declarations/implementation and the official tagged examples/tests.

Issue [#14](https://github.com/Blaise-g/pi-subagents-minimal/issues/14) withholds contract approval because the current boundary contradicts the accepted public-seam constraint; issue [#15](https://github.com/Blaise-g/pi-subagents-minimal/issues/15) asks for its replacement. The current contract requires public `createAgentSession()`, no child extensions, and invocation-bound event evidence (`docs/spec/v1-implementation-contract.md:255-280`), but currently assigns Setup through prompt acceptance, Running thereafter, and names `preflightResult` as that boundary (`docs/spec/v1-implementation-contract.md:300-313`).

## Facts

### `preflightResult` is exported but explicitly internal

There is a packaging nuance worth recording precisely: `PromptOptions` is exported from the package root (`dist/index.d.ts:1-3`), and the installed SDK guide describes `preflightResult` and its true/false meanings (`docs/sdk.md:180-199`). Nevertheless, the exact declaration labels that member an **“Internal hook used by RPC mode”** (`dist/core/agent-session.d.ts:153-165`), and the implementation's RPC command handler is its consumer (`dist/modes/rpc/rpc-mode.js:298-318`). The official regression test likewise uses `source: "rpc"`, checks `preflightResult(false)`, and verifies that no `agent_start` occurred (`packages/coding-agent/test/suite/regressions/7150-rpc-prompt-during-compaction.test.ts:57-89` at the official 0.84.3 tag).

Therefore the property is mechanically reachable and mentioned in SDK prose, but Pi's owning type declaration gives it internal RPC intent. This report does not recommend it as a supported SDK-consumer seam.

### What each candidate boundary means

| Candidate | Positive acceptance? | Pre-acceptance rejection? | Why it is not a single in-process boundary |
|---|---|---|---|
| Calling `session.prompt()` | No | No | Invocation only obtains the operation's promise. The public signature says it sends a prompt and returns `Promise<void>` (`dist/core/agent-session.d.ts:352-361`). |
| `prompt()` settlement | Completion, not acceptance | A rejection can expose an early failure | The SDK says `prompt()` waits for completion (`docs/sdk.md:66-80`); accepted runs include retries before it resolves (`docs/sdk.md:194-199`). Runtime/provider failures are normally encoded as assistant events/messages rather than promise rejection: the agent core contract requires stream failures to become final `error`/`aborted` messages (`node_modules/@earendil-works/pi-agent-core/dist/types.d.ts:3-13`), and its run wrapper converts thrown run faults into such messages (`node_modules/@earendil-works/pi-agent-core/dist/agent.js:330-365`). |
| `input` | No | No rejection event | It occurs before skill/template expansion and may transform or handle input without an agent run (`docs/extensions.md:891-935`). In implementation it precedes model/auth validation and `before_agent_start` (`dist/core/agent-session.js:813-888`). |
| `before_agent_start` | Not yet | No | It is documented as before the agent loop (`docs/extensions.md:530-565`). Implementation emits it before the internal positive callback and before `_runAgentPrompt()` (`dist/core/agent-session.js:887-922`). |
| `agent_start` | **Yes: low-level run started** | No negative counterpart | Pi documents it as firing when a low-level run begins (`docs/extensions.md:567-580`), and it is in the exported event type (`dist/core/agent-session.d.ts:39-52`; agent-core `dist/types.d.ts:367-395`). The loop emits it before `turn_start`, user-message events, context conversion, and provider streaming (`node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:43-55,178-198`). |
| `message_start` / `message_end` / `message_update` | Later evidence only | No | Message lifecycle covers user, assistant, and tool-result messages (`docs/extensions.md:597-615`). Official event-order tests put `agent_start` first, then `turn_start`, then the user message (`packages/coding-agent/test/suite/agent-session-retry-events.test.ts:239-257`). |
| `queue_update` | Queue state only | No | Its public payload is only pending steering and follow-up arrays (`dist/core/agent-session.d.ts:47-52`); the implementation emits it when those queues change (`dist/core/agent-session.js:301-306`). An idle child prompt does not use that queue. |
| thrown error / rejected `prompt()` promise | Negative only, if observed before `agent_start` | **Yes, as one side of a composite** | Pre-run checks can reject—for example compaction in progress, no model/auth, or invalid streaming behavior (`dist/core/agent-session.js:795-917`)—but there is no typed rejection stage/result. After `agent_start`, the same promise is the full-run promise, so timing against the event is required. |
| `before_provider_request` | Provider payload is about to be sent | No | It is later than run start and only a positive provider boundary; it is documented as firing right before sending a built provider payload (`docs/extensions.md:687-702`). It also requires a child extension handler, while the contract says child extensions are absent. |
| `after_provider_response` | Response received, not prompt acceptance | No | It occurs after an HTTP response and before consuming its stream; transport/header availability is provider-dependent (`docs/extensions.md:704-718`). |
| RPC `prompt` response | **Yes** | **Yes** | This is the one documented dual-outcome boundary, but it belongs to the RPC transport. The protocol explicitly defines both meanings (`docs/rpc.md:43-76`), while the SDK recommends direct `AgentSession` for Node/TypeScript consumers (`docs/rpc.md:1-7`). |

The implementation confirms the key ordering: internal acceptance is signalled immediately before `_runAgentPrompt()` (`dist/core/agent-session.js:918-923`); `_runAgentPrompt()` calls agent-core (`dist/core/agent-session.js:747-759`); and agent-core's first loop event is `agent_start` (`node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js:43-55`). Thus public `agent_start` is the closest stable positive in-process observation, but Pi exposes no matching `prompt_rejected` event.

## Recommendation (contract design, not a Pi fact)

Replace “Pi prompt acceptance” with **“child run start”** and define the public composite boundary exactly:

1. During Setup, create the isolated session, record the message boundary, subscribe to `AgentSessionEvent`, and establish the Setup timer.
2. Invoke exactly one ordinary child prompt with prompt/skill expansion disabled and with the contract's extension-free resource loader. Retain the returned promise without awaiting it serially before event handling.
3. The **first `agent_start` attributable to that child invocation** atomically wins `setup → running`; at that same monotonic instant, cancel the Setup timer and start the full Running deadline. Ignore later `agent_start` events from retry/compaction continuations as deadline boundaries.
4. Any exception while invoking `prompt()` or rejection of its promise **before** that first event is `failed`, stage `setup`, code `PROMPT_REJECTED`. Here that code means “the child prompt did not start an agent run,” not Pi's private preflight boolean. A resolution without `agent_start` is the same setup failure, because handled commands/input are not valid child execution.
5. After `agent_start`, promise rejection or error-message settlement is run-stage `RUN_FAILED`; Running timeout is `RUN_TIMEOUT`. If Setup timeout/cancellation races with `agent_start`, preserve the contract's atomic first-transition-wins rule.

This keeps Setup and Running sequential and distinct: prompt preprocessing, model/auth checks, and all work before public run start consume Setup; provider preparation, provider I/O, tools, retry, compaction, and settlement consume Running. It also starts Running before provider request construction—the first provider call is later in the loop—so no provider work escapes the Running budget.

Changing the child implementation to RPC solely to obtain its dual-outcome response is not recommended: it would reopen the in-process `createAgentSession()` runtime, transport, isolation, cleanup, and capability decisions for a boundary that the public event-plus-promise composite already supplies.

## Decision impact

- **Unblocks:** repository issue [#16](https://github.com/Blaise-g/pi-subagents-minimal/issues/16) can replace the internal hook and correct the canonical lifecycle language; [#17](https://github.com/Blaise-g/pi-subagents-minimal/issues/17) can then re-review the corrected contract.
- **Suggested upstream ticket:** request a supported in-process `AgentSession` prompt-admission result/event (invocation-correlated accepted/rejected) so future consumers do not need the composite race. This is an API improvement, not a v1 blocker.
