# Dynamic-tool activation failure semantics research

## Scope and evidence basis

This report investigates the locally installed Pi package and this repository only. The installed package identifies itself as `@earendil-works/pi-coding-agent@0.84.3` in `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json`. I read the complete installed `docs/extensions.md`, its linked deferred-tool example, relevant distributed JavaScript/type declarations, the repository contract, runtime, extension entry point, and focused checked-in tests. I did **not** retrieve external source/version tags or run tests or commands.

Principal local sources:

- Normative package contract: `docs/spec/v1-implementation-contract.md`, especially §§2.2, 3.2–3.3, 4, 8, 10–12, 14.1.
- Package implementation: `src/runtime.ts` (`installSuccessfulSingleRuntime`, `updateActivation`, `maybeFinalize`, `execute`, `execute.shutdown`, `execute.reconstruct`) and `extensions/subagents-minimal.ts` (`createExtension`).
- Package tests: `test/successful-single.test.ts`, `test/recovery.test.ts`, `test/finalization-faults.test.ts`, `test/shutdown.test.ts`, and `test/preflight.test.ts`.
- Installed Pi documentation: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`, particularly “Long-lived resources and shutdown,” “Lifecycle Overview,” “Session Events,” “ExtensionAPI Methods,” and “Dynamic Tool Loading.”
- Installed Pi example: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/kimi-deferred-tools.ts`.
- Installed Pi extension plumbing: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js` (`createExtensionRuntime`, `createExtensionAPI`), `dist/core/extensions/runner.js` (`ExtensionRunner.bindCore`, `ExtensionRunner.invalidate`, `ExtensionRunner.getActiveTools`, `emitSessionShutdownEvent`), and `dist/core/extensions/wrapper.js` (`wrapRegisteredTool`).
- Installed Pi session/tool implementation: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js` (`getActiveToolNames`, `setActiveToolsByName`, `_refreshToolRegistry`, `_installAgentNextTurnRefresh`, `reload`, `dispose`) and `dist/core/agent-session-runtime.js` (`AgentSessionRuntime.teardownCurrent`, `switchSession`, `newSession`, `fork`, `dispose`).
- Installed deferred-loading implementation: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`, `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/deferred-tools.js` (`splitDeferredTools`), `dist/api/anthropic-messages.js`, `dist/api/openai-responses.js`, `dist/api/openai-codex-responses.js`, and `dist/api/openai-responses-shared.js`.

## Facts

### 1. `getActiveTools()` and `setActiveTools()` are synchronous, whole-set APIs

- The public installed declaration at `dist/core/extensions/types.d.ts:ExtensionAPI` describes `getActiveTools(): string[]` and `setActiveTools(toolNames: string[]): void`. The installed documentation says `getActiveTools()` returns active **names**, whereas `getAllTools()` returns metadata.
- `dist/core/extensions/loader.js:createExtensionAPI` calls `assertActive()` and then directly delegates both operations to the session runtime. Consequently stale extension APIs throw before reading or writing.
- `dist/core/agent-session.js:getActiveToolNames` derives a fresh array from `agent.state.tools.map(tool => tool.name)`.
- `dist/core/agent-session.js:setActiveToolsByName` builds a replacement list from the requested names, silently ignores names absent from `_toolRegistry`, assigns `agent.state.tools`, rebuilds the base system prompt, and updates `agent.state.systemPrompt`. It returns no status or acknowledgement. The implementation itself does not catch errors.
- Duplicate requested names are not deduplicated by `setActiveToolsByName`; callers that need set semantics must deduplicate. This package does so for addition with `new Set` and removes by filtering.
- Installed docs say changes apply before the next model request/turn. `dist/core/agent-session.js:_installAgentNextTurnRefresh` snapshots current `agent.state.tools` and the rebuilt system prompt for the next request, including the next request in the same agent run.

**Failure implication:** Pi offers no transactional compare-and-swap, owner-scoped mutation, success result, or asynchronous completion signal. A call either returns synchronously after replacing state/rebuilding the prompt or throws. Unknown names are not a throw condition; they are ignored.

### 2. Pi’s dynamic activation signal is an additive change made during a tool execution

- Installed `docs/extensions.md#dynamic-tool-loading` says all tools must already be registered; a loader calls `setActiveTools([...current, ...added])`; purely additive changes are recorded on that tool result; the new definitions are available on the immediately following request. Removal/replacement uses ordinary fallback.
- `dist/core/extensions/wrapper.js:wrapRegisteredTool` snapshots active names before `await execute(...)`, snapshots again only after successful resolution, and adds `addedToolNames` to the returned result only if every previously active name remains and at least one new name exists. Thus:
  - pure additions on a successfully resolved extension tool get transcript metadata;
  - any removal suppresses `addedToolNames` for the whole change;
  - if tool execution throws after changing active state, the wrapper never records additions on the error result;
  - an activation outside a wrapped tool execution has no result anchor and therefore no `addedToolNames` metadata.
- `pi-agent-core/dist/agent-loop.js` persists `result.addedToolNames` on the resulting `toolResult` message.
- This is not a special loader-tool API. The installed docs explicitly state that the active-set delta is the signal.

### 3. Native deferred loading is provider serialization, not a separate extension activation API

- `pi-ai/dist/utils/deferred-tools.js:splitDeferredTools` examines the **current** tool list plus transcript `toolResult.addedToolNames`. When native handling is disabled, all current tools are immediate. When enabled, names introduced by prior tool results (unless already used) are separated as deferred definitions.
- Anthropic: `pi-ai/dist/api/anthropic-messages.js` defaults `supportsToolReferences` to first-party Anthropic Sonnet/Opus/Fable 4.5+ except Haiku; deferred definitions receive `defer_loading: true`, and the tool-result load point receives `tool_reference` blocks.
- OpenAI Responses/Codex Responses: `pi-ai/dist/api/openai-responses.js` and `openai-codex-responses.js` prefer `compat.supportsAdditionalTools`, otherwise `compat.supportsToolSearch`; `openai-responses-shared.js` creates message-anchored additional definitions or completed client `tool_search_call`/output items. This is more specific than the installed extension docs, which summarize OpenAI native handling as tool-search items.
- The local installed catalog `pi-ai/dist/providers/data/openai-codex.json` marks `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.5` with `supportsToolSearch`; it marks `gpt-5.6-luna`, `gpt-5.6-sol`, and `gpt-5.6-terra` with both `supportsAdditionalTools` and `supportsToolSearch`, so source preference selects message-anchored additional tools for those 5.6 entries.
- Fallback is safe and functional: without native support—or for a non-additive change—the next request receives the complete current tool list normally. The cost is possible prompt-prefix cache invalidation. Active `promptSnippet`/`promptGuidelines` also rebuild the system prompt and can invalidate the prefix even with native schemas.

### 4. Startup, teardown, reload, and replacement establish a strict API lifetime

- Installed docs say extension factories may run in invocations that never start a session; background resources should start at `session_start` or on demand and be closed by an idempotent `session_shutdown` handler.
- Startup/reload/new/resume/fork create or bind a session runtime and emit `session_start`. New/resume/fork first emit `session_shutdown` for the outgoing extension instance; reload also emits shutdown before reloading.
- `dist/core/agent-session-runtime.js:AgentSessionRuntime.teardownCurrent` first awaits `session.abort()`, then awaits `session_shutdown`, then disposes the old session. `switchSession`, `newSession`, and `fork` create/apply a new runtime afterward.
- `dist/core/agent-session.js:reload` awaits old `session_shutdown`, invalidates the old runner, reloads, builds the new runtime, and starts it. `AgentSession.dispose` invalidates its extension runner.
- `dist/core/extensions/loader.js:createExtensionRuntime` and `dist/core/extensions/runner.js:ExtensionRunner.invalidate` make captured old `pi`/context objects stale. Subsequent `getActiveTools`/`setActiveTools` through them throw the documented stale-context error.
- Therefore shutdown work may use the outgoing API while the shutdown handler is being awaited, but queued/unawaited work that reaches the API after invalidation can throw. The package’s shutdown handler returns `executeDelegation.shutdown()`, so Pi awaits the package cleanup path.

### 5. Package activation behavior mostly follows the ownership-preserving contract

`src/runtime.ts:installSuccessfulSingleRuntime` defines:

```ts
const updateActivation = (wanted: boolean) => activation = activation.then(() => {
  const active = pi.getActiveTools();
  const next = wanted
    ? [...new Set([...active, "delegation_control"])]
    : active.filter((x) => x !== "delegation_control");
  if (JSON.stringify(next) !== JSON.stringify(active)) pi.setActiveTools(next);
}).catch(() => {});
```

Facts from this implementation:

- Every update is chained through one promise, so package decisions are serialized.
- Each queued callback reads `pi.getActiveTools()` at execution time; it does not restore a captured/stale snapshot.
- It changes only `delegation_control`, retaining foreign active names. `test/successful-single.test.ts` checks that `other_extension_tool` survives admission and consumption; `test/finalization-faults.test.ts` retains `foreign` through an injected fault.
- Admission awaits `updateActivation(true)` after record/queue registration and before returning the accepted response (`src/runtime.ts:execute`).
- Persisted terminalization calls `updateActivation(true)` after persistence and before notification (`maybeFinalize`), unless shutdown is active.
- Successful terminal inspection appends the consumption marker first, flips `unread = false`, then awaits reconciliation based on all records.
- `execute.reconstruct` clears in-memory records, scans the active branch, then awaits activation iff some reconstructed result is unread.
- `execute.shutdown` sets shutdown mode, cancels/finalizes within the grace process, and finally awaits `updateActivation(false)`.
- `extensions/subagents-minimal.ts:createExtension` registers `delegation_control` whenever startup configuration is valid, reconstructs on `session_start`, and returns shutdown from `session_shutdown`.

This matches contract §3.3’s fresh-read/own-name/serialized-update requirements and §11.4’s active-branch reconstruction intent under successful host calls.

### 6. `delegate` admission can use Pi’s native deferred representation without package-specific provider code

- `delegate` and `delegation_control` are extension-registered tools. During a successful `delegate` execution, `src/runtime.ts:execute` performs a pure additive active-set change before returning.
- Pi’s `wrapRegisteredTool` therefore observes `delegation_control` as newly added and adds it to the accepted tool result’s `addedToolNames`, provided `setActiveTools` succeeded and no active tool was removed concurrently.
- On a native-capable model, the subsequent request can represent `delegation_control` natively at the accepted result. On other models it appears in the complete next active list. This satisfies the intended “native where supported, ordinary fallback elsewhere” path for normal admission.
- Removing `delegation_control` during its own terminal inspection is non-additive, so Pi intentionally uses fallback. Startup reconstruction is outside tool execution, so it has no transcript load anchor and is also represented as an ordinary active tool on the next request rather than as a native deferred addition.

### 7. Activation failures are currently swallowed and can violate reachability

- `updateActivation(...).catch(() => {})` catches failures from both `getActiveTools()` and `setActiveTools()`, exposes no result, records no diagnostic, and lets the caller continue as if reconciliation completed.
- Because the catch is attached to each assigned chain, a failure does not permanently poison the queue; a later update can run. There is, however, no guaranteed retry solely because one update failed.
- Admission may therefore return a valid Delegation id while `delegation_control` remains inactive. The background work and persistence proceed, but inspect/cancel may be unreachable until some later successful reconciliation. A persistent activation failure leaves live/unread state inaccessible through the intended tool.
- A failed removal can leave `delegation_control` active while idle/fully consumed. A failed reconstruction reconciliation can similarly leave the startup default wrong.
- Activation failure does not rewrite child or Delegation outcomes, which agrees with contract §10’s general host-fault rule, but it is invisible.
- `src/runtime.ts:HostDiagnostic` only admits stages `cleanup | lifecycle | persistence` with an unrestricted string code. Contract §10 additionally specifies `configuration | compatibility`, but its exact code union contains **no activation-failure code**. Contract §3.3 states desired activation behavior but does not define failure propagation, diagnostic code, retry policy, or what admission should do if activation fails.
- `test/finalization-faults.test.ts` injects one activation throw in “notification and activation faults leave persisted result terminal,” but only asserts terminal outcome, notification behavior, and preservation of a foreign tool. It does not assert an activation diagnostic, retry count, exact final control state, or persistent-failure reachability. Other tests use no-op or infallible activation fakes.

### 8. Installed Pi’s normal implementation narrows—but does not remove—the failure concern

- In installed Pi 0.84.3, `setActiveToolsByName` is synchronous local state replacement plus system-prompt rebuild; it has no network or persistence operation. Unknown names are ignored. Thus ordinary failures are unlikely after registration.
- Real throw paths still exist: stale extension API use is explicit; unexpected prompt/resource getter errors during `_rebuildSystemPrompt` can propagate; tests are also entitled to inject host failure at the public boundary.
- More importantly, the package contract treats host faults deterministically. “Unlikely in this installed implementation” is not equivalent to specified failure semantics across the declared `>=0.84.3 <0.85.0` range.

### 9. Initial registration and invalid-configuration edge

- Pi’s `AgentSession._buildRuntime` invokes `_refreshToolRegistry({ includeAllExtensionTools: true })`, so registered extension tools are initially included before `session_start`; the package’s `execute.reconstruct` then reconciles `delegation_control` to active only for unread branch state. In normal startup, `session_start` is awaited before use, so this is a transient host initialization state rather than a model-visible default.
- If that startup reconciliation throws, the package swallows it; the transient “all extension tools active” state may remain, even with no unread result.
- With invalid package configuration, `extensions/subagents-minimal.ts:createExtension` does not call `installSuccessfulSingleRuntime`, does not register `delegation_control`, and does not register reconstruction handlers. This conflicts with contract §4’s statement that `delegation_control` remains inactive **unless startup reconstruction finds** a valid unread envelope: under invalid configuration, reconstruction cannot occur at all.

## Contract comparison summary

| Requirement | Local implementation / Pi behavior | Assessment |
|---|---|---|
| Register control but inactive by default (§3.2) | Registered on valid config; `session_start` reconstruction reconciles after Pi’s transient all-extension-tools initialization | Meets after successful startup reconciliation; failure is silent |
| Fresh `getActiveTools`, alter only own name (§3.3) | `updateActivation` reads inside serialized callback and adds/filters only `delegation_control` | Meets |
| Serialized state/activation decisions (§3.3) | Promise chain serializes calls; record state itself is largely single-threaded but activation target is passed as a boolean decision | Meets the update serialization requirement |
| Native deferred addition where supported; fallback elsewhere (§3.3) | Normal admission is a pure addition inside wrapped `delegate`, yielding `addedToolNames`; provider serializers choose native support, otherwise full-list fallback | Meets normal admission; reconstruction/background reactivation necessarily uses ordinary representation |
| Remove only when no live/unread (§3.3) | Consumption computes across records; shutdown force-removes as teardown policy | Meets successful normal operation; failed set can leave stale state |
| Host faults do not rewrite outcomes (§10) | Activation failure is swallowed and outcomes continue | Meets non-rewrite principle |
| Host faults observable via bounded diagnostics (§10 overall design) | No activation diagnostic; contract code union itself lacks one | Specification gap plus implementation observability gap |
| Graceful shutdown (§12) | Handler is awaited; cleanup ends with serialized removal | Meets on successful host call; removal failure is silent |
| Invalid config may still recover unread (§4) | Runtime/control/reconstruction are absent on invalid config | Does not meet literal contract |

## Recommendations

1. **Make a specification decision before implementation.** Add explicit activation-failure semantics to §§3.3 and 10. At minimum define a bounded lifecycle diagnostic such as `TOOL_ACTIVATION_FAILED`, whether admission still succeeds, and when reconciliation retries. The existing exact diagnostic union cannot represent the fault.
2. **Replace swallowed errors with bounded reconciliation state.** Keep the fresh-read and serialized queue, but catch into a package-level/session-level diagnostic store and retain a “desired activation” flag. Retry at deterministic safe triggers: admission completion, terminal persistence, inspect, `session_start`, and shutdown. Coalesce to the latest desired state rather than replaying obsolete booleans where practical.
3. **Protect reachability explicitly.** Preferred semantics: after successful admission, failure to activate control should not erase the accepted work, but should emit a host diagnostic and retry promptly; if the public tool call can still truthfully return an accepted id, document that temporary control unavailability is possible. Do not convert child outcomes because of host activation failure.
4. **Add defect-revealing red tests before green changes, per `AGENTS.md` and contract §14.** Cover persistent add failure, transient add failure with retry, persistent remove failure, startup reconstruction failure, shutdown failure, foreign-tool preservation on every retry, and failure after session invalidation. Assert exact diagnostic bounds/deduplication and final desired state.
5. **Add a Pi-bound integration test for deferred metadata.** Through the highest stable public boundary, assert that successful `delegate` addition creates `addedToolNames: ["delegation_control"]`, removal does not, and an unsupported model gets the full-list fallback. Unit fakes that call tool definitions directly bypass `wrapRegisteredTool` and currently do not prove native deferred behavior.
6. **Clarify reconstruction wording.** State that native deferred loading requires a tool-result anchor; session-start reconstruction and out-of-band reactivation use Pi’s ordinary current-tool representation even on native-capable models.
7. **Resolve invalid-config reconstruction.** If contract §4 is retained, separate the persisted-inbox/control runtime from admission configuration so unread envelopes can reconstruct and activate control even when new delegation is disabled.
8. **Avoid provider-specific code in this package.** Pi already owns `addedToolNames`, deferred splitting, protocol selection, and fallback. The package should continue to express only a pure active-set addition/removal.

## Uncertainty and facts requiring external version-source retrieval

### Locally resolvable uncertainty

- The installed source proves behavior for the distributed 0.84.3 build, not every operational exception source. `setActiveToolsByName` is synchronous and simple, but `_rebuildSystemPrompt` calls resource-loader getters and `buildSystemPrompt`; no public “never throws” guarantee was found.
- Pi’s wrapper attributes every additive delta observed across a tool execution to that tool result. If another extension changes tools concurrently during `delegate`, unrelated additions could be included, or a concurrent removal could disable native metadata for `delegation_control`. The package’s own queue cannot serialize other extensions. No installed documentation promises cross-extension atomic isolation.
- Installed extension docs describe OpenAI native representation as tool-search, while installed 0.84.3 source/catalog prefers `supportsAdditionalTools` for GPT-5.6 catalog entries. The source is authoritative for this installed artifact, but the documentation wording is incomplete.

### External version-source retrieval required

The following cannot be established from the installed 0.84.3 artifact and repository alone:

1. Whether `getActiveTools`, `setActiveTools`, stale-context behavior, tool wrappers, or session teardown differ in any later stable `0.84.x` covered by contract `>=0.84.3 <0.85.0`. Retrieve exact npm tarballs/tags and compare the named symbols.
2. Whether upstream PR/issue fixes cited by installed `CHANGELOG.md`—especially dynamic loading PR `#6474`, same-run tool refresh issue `#6162`, session replacement issue `#7022`, and additional-tools change `#7709`—carry tests or caveats not shipped in the npm artifact. Retrieve the matching upstream tag/commit and test sources.
3. Whether the provider claims in installed docs (“Anthropic 4.5+ except Haiku,” “OpenAI gpt-5.4+ family”) remain valid for every supported endpoint/model revision. This requires versioned upstream model catalogs/provider protocol documentation, not inference from one local catalog.
4. Whether npm `0.84.3` is the only or latest stable release in the declared range. That requires registry/tag retrieval.
5. Exact original TypeScript source locations and upstream tests corresponding to distributed `dist/*.js`, if source-level citations rather than installed-artifact citations are required. The package metadata points to `https://github.com/earendil-works/pi.git` under `packages/coding-agent`, but no external checkout was available in this investigation.

## Conclusion

Pi 0.84.3 already supplies the intended dynamic mechanism: a pure additive `setActiveTools` change inside successful `delegate` execution becomes `addedToolNames`, native-capable providers serialize it at the accepted result, and every other case safely falls back to the complete active list. The package correctly fresh-reads and preserves foreign tools, serializes its updates, and uses awaited startup/shutdown hooks. The material defect/specification gap is failure handling: `src/runtime.ts:updateActivation` suppresses every activation error without a diagnostic or guaranteed retry, while the normative HostDiagnostic union has no activation-failure code. Persistent failure can make accepted or recovered work unreachable, or leave control active while idle. The next step should be an explicit contract decision followed by red tests and bounded desired-state reconciliation, not provider-specific deferred-loading code.