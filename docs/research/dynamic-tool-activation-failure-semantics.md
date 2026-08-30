# Dynamic-tool activation failure semantics

Research for [Research dynamic-tool activation failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/64).

## Scope and source baseline

This report compares the repository with `@earendil-works/pi-coding-agent@0.84.3`, the installed and supported Pi package version. The corresponding first-party source tag is [`v0.84.3`](https://github.com/earendil-works/pi/tree/v0.84.3). Conclusions below distinguish public documentation from observed implementation behavior; undocumented implementation details are not treated as stable API guarantees.

## Publicly documented behavior

Pi documents `pi.getActiveTools()` as returning the active tool names and `pi.setActiveTools(names)` as selecting active built-in and dynamically registered tools. Unknown names are ignored. Changing the active set rebuilds the system prompt and takes effect on the next turn. During tool execution, a purely additive change is detected and attached to the tool result so the new tools can be made available before the next model request; callers are instructed not to remove active tools in that same call.

Sources:

- Pi 0.84.3 extension API, `getActiveTools`/`setActiveTools`: [`docs/extensions.md`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/extensions.md)
- Pi 0.84.3 deferred/dynamic tool loading guidance: [`docs/extensions.md`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/docs/extensions.md)

The public documentation does **not** specify an error value, retry policy, diagnostic event, or recovery guarantee for getter/setter failure during startup, ordinary execution, teardown, or session replacement.

## Observed Pi 0.84.3 implementation

### Startup

Before the extension runtime binds its API, `getActiveTools` and `setActiveTools` are throwing stubs with an “Extension runtime not initialized” error. If an extension factory calls them during loading and throws, Pi discards that extension and records an extension-load error. This is implementation behavior, not a separately documented activation-failure contract.

Primary source: Pi 0.84.3 [`loader.ts`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/extensions/loader.ts).

### Execution

The bound setter filters unknown names, replaces the active set, and rebuilds the system prompt. It returns no structured failure result. The tool wrapper detects additive changes made during execution and records the added names on the result; non-additive changes use Pi's fallback path rather than the additive optimization.

Primary sources:

- Pi 0.84.3 [`agent-session.ts`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/agent-session.ts)
- Pi 0.84.3 extension [`wrapper.ts`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/extensions/wrapper.ts)

No upstream source establishes that calls cannot throw indirectly—for example while rebuilding runtime state—so an extension must not infer a no-failure guarantee merely from the lack of a result type.

### Teardown and session replacement

On replacement, Pi shuts down the old session, emits `session_shutdown`, disposes and invalidates the old extension runner, creates the replacement, and emits `session_start`. Access through stale old contexts throws. Pi does not document activation state as a cross-session snapshot that extensions may restore.

Primary sources:

- Pi 0.84.3 [`agent-session-runtime.ts`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/agent-session-runtime.ts)
- Pi 0.84.3 extension [`runner.ts`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/src/core/extensions/runner.ts)

The package's correct authority model is therefore to reconstruct its desired contribution from the new session's current active set, not restore a stale whole-set snapshot from the prior session.

## Repository behavior

[`src/runtime.ts`](../../src/runtime.ts) serializes activation decisions. Every update reads the host's current active set, adds or removes only `delegation_control`, and avoids overwriting foreign tools. The same path is reached during reconstructed startup state, Delegation admission and settlement, consumption, and shutdown.

However, the activation promise ends with an empty `.catch(() => {})`. It silently consumes failures from both `getActiveTools()` and `setActiveTools()`. Consequences include:

- startup/reconstruction can leave `delegation_control` unreachable despite live or unread Delegations;
- settlement can leave the control active or inactive contrary to current reachability;
- shutdown deactivation can fail without any cleanup observation;
- later queued activation decisions continue, but neither operators nor persisted evidence learn that an earlier decision failed.

The serialization and foreign-tool preservation satisfy the authority rule in [`docs/spec/v1-implementation-contract.md` §3.3](../spec/v1-implementation-contract.md). Silent failure does not satisfy the contract's diagnostic model.

## Normative taxonomy mismatch

The contract defines a **Host diagnostic** as a bounded, non-outcome observation and classifies stages as `configuration`, `compatibility`, `persistence`, `cleanup`, or `lifecycle` ([contract §10](../spec/v1-implementation-contract.md)). Cleanup faults must remain diagnostics and must not rewrite Terminal outcomes; shutdown must deactivate control and boundedly settle cleanup ([contract §§10–11](../spec/v1-implementation-contract.md)).

Current implementation gaps:

1. Dynamic activation failures have no diagnostic code and are swallowed entirely.
2. The implementation-local diagnostic stage union omits normative `configuration` and `compatibility` stages.
3. Its diagnostic `code` is unconstrained `string`, so the normative taxonomy is not represented exhaustively.
4. `CONSUMED_MARKER_PERSIST_FAILED` is classified as `lifecycle`, although the failed operation is persistence.
5. `HOST_UNSUPPORTED` is written directly to stderr by [`extensions/subagents-minimal.ts`](../../extensions/subagents-minimal.ts), rather than represented through the runtime Host-diagnostic shape.

Activation failure is a host/lifecycle observation, never a Subagent run failure and never grounds to rewrite a Delegation's Terminal outcome. A shutdown deactivation fault additionally belongs to cleanup. The specification must decide exact codes, stage assignment by call site, bounded emission/persistence behavior, and whether failed reachability updates are retried before implementation can be handed off safely.

## Version-history context

Pi's first-party changelog records dynamic activation in 0.39.0, cache-friendly tool-result activation in 0.80.7, Kimi deferred loading in 0.80.9, and OpenAI Responses fallback work in 0.84.2. These changes explain the current additive/fallback machinery but do not add a public activation-failure contract.

Source: Pi 0.84.3 [`CHANGELOG.md`](https://github.com/earendil-works/pi/blob/v0.84.3/packages/coding-agent/CHANGELOG.md).

## Decision input

Treat Pi's documented semantics as synchronous whole-set selection with unknown-name filtering and next-turn application, plus an additive during-tool optimization. Do not rely on undocumented non-throwing behavior. Preserve current serialized read-modify-write authority, but specify bounded Host diagnostics for every failed activation decision, with lifecycle versus cleanup classification by context, without changing any Delegation outcome. Decide retry and diagnostic persistence separately; upstream Pi does not answer either question for this extension.
