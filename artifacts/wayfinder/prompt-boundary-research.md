# Prompt preflight versus agent-start lifecycle semantics

## Scope and conclusion

This research compares `PromptOptions.preflightResult` with the first invocation-bound `agent_start` event for the package’s supported Pi range. Local executable evidence exists for **Pi 0.84.3 only**. The repository contract supports stable Pi `>=0.84.3 <0.85.0`, but no other 0.84.x installation or unpacked source is locally available.

**Conclusion:** keep the contract’s first invocation-bound public `agent_start` boundary and do not use `PromptOptions.preflightResult`. In installed Pi 0.84.3, `preflightResult(true)` is a useful RPC acknowledgement that prompt preprocessing accepted, queued, or handled an invocation, but it is neither a low-level agent-run boundary nor a guarantee that an agent run will occur. Its type declaration explicitly calls it an **internal hook used by RPC mode**. By contrast, the first `agent_start` is emitted by `pi-agent-core` at entry to the low-level run, before `turn_start`, user-message events, and provider work. Retries and compact-and-retry continuations each emit another `agent_start`, so an invocation-scoped one-shot guard is required.

The repository’s normative choice in `docs/spec/v1-implementation-contract.md` §§7 and 8.1 is therefore technically sound for 0.84.3. The current implementation follows the broad design in `src/runtime.ts`, but deterministic tests do not yet prove all issue-15 cases promised by the contract, and cancellation while prompt preprocessing or auto-compaction is active deserves stronger race coverage.

## Evidence base

### Installed Pi and agent-core

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/package.json`: installed coding-agent version `0.84.3`, Node engine `>=22.19.0`, dependency `@earendil-works/pi-agent-core: ^0.84.3`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/package.json`: resolved agent-core version `0.84.3`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`, “Prompting and Message Queueing”.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`, “Lifecycle Overview” and “agent_start / agent_end / agent_settled”.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/compaction.md`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts`, `PromptOptions`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.js`, `AgentSession.prompt`, `_runAgentPrompt`, `_handlePostAgentRun`, `_checkCompaction`, `_runAutoCompaction`, `_prepareRetry`, `abort`, `dispose`, and `_handleAgentEvent`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/agent-loop.js`, `runAgentLoop` and `runAgentLoopContinue`.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/agent.js`, `Agent.abort`, `Agent.subscribe`, and idle settlement.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/README.md`, “Event Flow”.
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/CHANGELOG.md`, especially 0.80.4 `agent_settled`, historical retry/compaction entries, and 0.84.3 current behavior.

### Repository and issue-15 decision references

- `docs/spec/v1-implementation-contract.md` §2.2 supports stable Pi `>=0.84.3 <0.85.0`.
- The same contract §7 requires subscribing before prompting and retaining invocation-bound run-start/completion evidence.
- Section 8.1 normatively selects the first invocation-bound public `agent_start`, ignores later retry/compaction starts, classifies pre-start prompt throw/rejection/resolution as setup `PROMPT_REJECTED`, and forbids `PromptOptions.preflightResult` and internal RPC hooks.
- Section 15 links this assertion to issue #15, “Identify a public Pi prompt-acceptance boundary,” and requires event/promise race, pre-start resolution/rejection, retry/compaction, timeout, and cancellation tests.
- Local remote refs preserve two relevant prior research heads: `.git/refs/remotes/origin/research/public-prompt-acceptance` at `d001825421972115db783114e3eb8dfd86ecb4af` and `.git/refs/remotes/origin/research/prompt-boundary-semantics` at `64d1d37f6b23eed96004684775518909a529c9e7`. The current `main` ref is also `64d1d37f6b23eed96004684775518909a529c9e7`. Their issue text/commit trees are not materialized as readable working-tree artifacts through the supplied file interfaces, so the normative contract is the locally readable decision record.
- `src/runtime.ts`, `installSuccessfulSingleRuntime` → `run`, implements a `started` one-shot flag, subscribes before one `child.prompt(task, { expandPromptTemplates: false })`, switches timers on the first `agent_start`, and classifies promise failure/resolution according to whether `started` became true.
- `src/runtime.ts`, `ChildSession`, intentionally narrows prompt options to `expandPromptTemplates`; it does not expose `preflightResult`.

## Facts

### 1. `preflightResult` acceptance timing and meaning in Pi 0.84.3

`PromptOptions` is exported, but `/dist/core/agent-session.d.ts` documents `preflightResult` as: “Internal hook used by RPC mode to observe prompt preflight acceptance or rejection.” The SDK documentation is more consumer-facing and says the callback is called once per `prompt()` invocation:

- `true` when accepted, queued, or handled immediately;
- `false` when prompt preflight rejects before acceptance;
- callback occurs before `prompt()` resolves;
- accepted `prompt()` still waits for the complete run, including retries;
- failures after acceptance are reported by normal events/messages, not a later `false`.

The installed source makes the exact timing concrete. `AgentSession.prompt` calls `preflightResult(true)`:

1. after an extension command handles the input, then returns without an agent run;
2. after an `input` extension handler returns `handled`, then returns without an agent run;
3. after a streaming prompt is queued as steer/follow-up, then returns without starting a new low-level run at that moment;
4. on the ordinary idle path, after model/auth checks, pre-prompt compaction checks, message construction, and `before_agent_start` processing, but immediately **before** `await this._runAgentPrompt(messages)`.

The surrounding preflight `try/catch` calls `preflightResult(false)` and rethrows for failures including: command/input processing errors, prompt submission during compaction, missing streaming behavior, skill/template expansion errors, absent model/auth, pre-prompt compaction errors that escape, and `before_agent_start` errors.

Therefore `true` means dispatch-level acceptance, not “provider accepted a request,” “the low-level agent started,” or “an assistant result will exist.” Handled and queued paths are explicit counterexamples. On the ordinary path, `true` precedes `_runAgentPrompt` and thus precedes `agent_start`.

A callback exception is not given special handling in the source. The ordinary-path `preflightResult(true)` call is outside the preflight `try/catch`; if the callback throws, `prompt()` rejects before `_runAgentPrompt`. This reinforces that it is an internal integration seam, not a lifecycle primitive extensions should supply.

### 2. Prompt resolution and rejection

For an ordinary accepted idle prompt, `AgentSession.prompt` awaits `_runAgentPrompt`. `_runAgentPrompt` awaits the first low-level `agent.prompt`, then any automatic `agent.continue()` loops, and finally emits `agent_settled`. Thus ordinary `prompt()` resolution is a full-settlement signal, not an acceptance signal.

A normal provider failure is generally represented by a finalized assistant message/stop reason and event stream; it need not reject the JavaScript promise. Promise rejection remains possible for thrown lifecycle/infrastructure/listener failures. Regardless, `preflightResult` is already `true` and is not revised.

A prompt can also resolve after `preflightResult(true)` without any `agent_start` when a command/input handler handles it, or when it only queues during another run. That is why the repository correctly classifies resolution before the invocation-bound event as `PROMPT_REJECTED` for its restricted child protocol: the child requires a real run, not generic dispatch acceptance.

### 3. Exact `agent_start` boundary

In agent-core 0.84.3:

- `runAgentLoop` emits and awaits `{ type: "agent_start" }`, then emits `turn_start`, then emits the supplied user-message lifecycle and enters the LLM/tool loop.
- `runAgentLoopContinue` likewise emits and awaits `agent_start`, then `turn_start`, then continues from existing context.
- `AgentSession._handleAgentEvent` forwards core events to extension handlers first, then session subscribers.
- `docs/extensions.md` calls `agent_start` the beginning of a **low-level agent run** and warns that `agent_end` may still be followed by auto-retry, auto-compact-and-retry, or queued follow-up work; `agent_settled` is the whole-session settled signal.

Consequently, the first subscriber-observed event is a public, externally observable run-entry boundary. It occurs before provider completion and is not provider-level acceptance, but it is the earliest documented public evidence that the low-level run exists.

“Invocation-bound” is not encoded in the event payload: `AgentStartEvent` contains only `type: "agent_start"`. Attribution comes from construction: subscribe immediately before exactly one prompt on a fresh isolated session, disable child extensions and expansion, permit no concurrent prompt/queue source, record the message boundary, and ignore subsequent starts with a local boolean. Those constraints are material, not optional wording.

### 4. Retries

`AgentSession._runAgentPrompt` runs:

```ts
await this.agent.prompt(messages);
while (await this._handlePostAgentRun()) {
  await this.agent.continue();
}
```

A retryable assistant error causes `_prepareRetry` to remove the failed assistant from active agent state, wait an abortable exponential backoff, and return `true`. The next `Agent.continue()` enters `runAgentLoopContinue`, which emits a new `agent_start`. The same is true for continuation needed to drain queued messages.

Therefore one `session.prompt()` invocation may produce multiple `agent_start` events. The first ends setup; later starts remain inside the same running deadline. `preflightResult` is still called only once for the outer `prompt()` invocation and does not report each retry.

### 5. Compaction

The compaction summarization request itself is not an agent-core prompt and does not emit an `agent_start` from the child agent loop. Automatic overflow recovery, however, removes the failed/truncated assistant, compacts, and returns `true`; `_runAgentPrompt` then calls `agent.continue()`, whose `runAgentLoopContinue` emits another `agent_start`. Threshold compaction after a completed response does not retry unless queued work requires a continuation.

Pre-prompt compaction can happen inside `AgentSession.prompt` before `preflightResult(true)` and before the first `agent_start` when an older aborted response is present. In this package the session is fresh and in-memory, so that path should have no prior assistant evidence, but it remains part of the general SDK semantics.

The installed docs and `_runAutoCompaction` show that accepted `prompt()` settlement encompasses auto-compaction and any compact-and-retry continuation. The contract is right not to restart the run deadline on the continuation’s later `agent_start`.

### 6. Cancellation

`AgentSession.abort()` calls `abortRetry()`, `agent.abort()`, and waits for session idle. `Agent.abort()` aborts only the active low-level run’s controller. `AgentSession.dispose()` is broader: it also aborts retry, manual/automatic compaction, branch summary, bash work, and the agent.

Implications:

- Before the first low-level run exists, `agent.abort()` has no active run controller to abort. Host state must therefore independently arbitrate setup cancellation/timeout against a late event or promise settlement.
- During retry backoff, `abortRetry()` cancels the delay and allows the outer prompt to settle without another continuation.
- During a provider run, abort produces normal aborted run evidence/events and prompt settlement.
- During automatic compaction, `AgentSession.abort()` does **not** call `abortCompaction()` in installed source; `dispose()` does. A host cancellation deadline and forced dispose are therefore necessary to bound settlement.
- Neither `PromptOptions` nor `preflightResult` accepts a cancellation signal. It does not solve cancellation races.

The normative “atomic first-transition-wins” rule belongs to package state, not Pi’s callback/event API.

### 7. Compatibility facts locally established

- Pi coding-agent and agent-core 0.84.3 agree on event behavior and versions.
- `PromptOptions` and `AgentSession` are exported from the package entry point in 0.84.3.
- `preflightResult` exists in 0.84.3 SDK docs and implementation but is labeled internal in its declaration.
- `agent_start` is documented in extension docs and emitted by both fresh and continuation low-level loops.
- Repository package/runtime dev dependencies pin 0.84.3 (`package.json`), and the normative host range starts at that exact version.

No local source establishes whether every later stable 0.84.x retains identical callback placement, internal/public status, cancellation behavior, or continuation event count.

## Findings against the current repository implementation

1. **Correct boundary selection.** `src/runtime.ts` subscribes before one ordinary prompt, uses `started` to ignore later events, turns Setup into Running at the first event, and never passes `preflightResult`.
2. **Correct promise-stage classification in the main path.** A throw/rejection before `started` becomes setup `PROMPT_REJECTED`; after it becomes run `RUN_FAILED`; resolution without a start is setup `PROMPT_REJECTED`.
3. **Isolation supports attribution.** `defaultRuntimeDependencies.createChild` creates a fresh in-memory session, disables extensions/skills/templates/themes, and `run` passes `expandPromptTemplates: false`.
4. **Test evidence is incomplete relative to §15.** `test/successful-single.test.ts` fakes one immediate `agent_start`; `test/unsuccessful-single.test.ts` covers run timeout and output length, but its default `prompt` resolves without a start and no test asserts the resulting pre-start `PROMPT_REJECTED`. No focused test was found for pre-start throw/rejection, later retry starts, compact-and-retry starts, or setup timeout/cancellation racing the first event. `docs/release-evidence.json` maps the assertion only to `successful-lifecycle` and `running-timeout`, which is weaker than the contract’s required issue-15 matrix.
5. **Race risk to verify.** The subscriber condition in `src/runtime.ts` checks `!started && !state.outcome`, but not `!state.settling`. Setup cancellation sets `state.settling` before asynchronous abort/force-cancel finishes. A late `agent_start` in that interval can transiently set the child/Delegation to running and switch timers even though cancellation has already claimed settlement. The final first-winner logic may still reject the result, but the phase/timer transition does not visibly encode the contract’s atomic race rule.
6. **Cancellation bounding is essential.** Because Pi 0.84.3 `AgentSession.abort()` does not abort automatic compaction, the package’s cancellation deadline plus `dispose()` is not merely defensive; it closes a real SDK cancellation gap.

## Recommendations

1. **Retain the normative rule:** first invocation-bound `agent_start` ends Setup; all later `agent_start` events from retry, overflow continuation, or queued continuation are ignored for deadlines.
2. **Do not use `preflightResult`:** it is internal by declaration, broader than run acceptance, can report true for no-run handling/queueing, has no cancellation signal, and adds a compatibility dependency with no needed information in the isolated child design.
3. **Keep ordinary public prompting:** one `session.prompt(exactTask, { expandPromptTemplates: false })` on a fresh session, with subscription installed first. Do not call `Agent.prompt` or private RPC seams directly.
4. **Make the first-transition guard explicit:** the event handler should require that setup remains legally live (including `!state.settling` or an equivalent atomic transition helper) before switching phase/timers. The event, setup timeout, cancellation, and prompt settlement should all compete through one state-transition function.
5. **Add defect-revealing deterministic tests before changing code:**
   - prompt throws before event → setup `PROMPT_REJECTED`;
   - prompt resolves before event → setup `PROMPT_REJECTED`;
   - event then rejection → run `RUN_FAILED`;
   - first event switches the timer exactly once; second/third starts representing retry and compact-and-retry do not restart it;
   - setup timeout vs event in both orders;
   - setup cancellation vs event in both orders, including the abort-await window;
   - cancellation during retry backoff and automatic compaction, proving forced dispose bounds settlement;
   - late event/result after terminal claim produces no phase rewrite.
6. **Treat `agent_settled` as corroborating whole-invocation evidence, not the start boundary.** `prompt()` resolution plus projected final assistant evidence is already the package’s completion path; adopting `agent_settled` is optional and must not replace first-start timing.
7. **Run the compatibility matrix from packed artifacts** at 0.84.3 and the latest supported 0.84.x. The matrix should inspect only public behavior (event sequence, promise settlement, abort/dispose), not source internals, so patch-level drift is caught.

## Uncertainty and external retrieval still required

The following cannot be established from the locally installed artifacts and readable repository files:

1. **All supported patch versions:** retrieve exact npm tarballs/source tags for every release actually claimed in `>=0.84.3 <0.85.0`, at minimum 0.84.3 and latest 0.84.x, then compare `PromptOptions`, `AgentSession.prompt`, `_runAgentPrompt`, `runAgentLoop`, `runAgentLoopContinue`, and `abort` behavior.
2. **Introduction/stability history of `preflightResult`:** the 0.84.3 changelog contains no matching entry. Retrieve upstream commit/PR history to determine when it appeared, why SDK docs describe it while the declaration says “Internal hook,” and whether maintainers consider it compatibility-stable for SDK consumers.
3. **Issue #15 full discussion and closing decision:** retrieve `https://github.com/Blaise-g/pi-subagents-minimal/issues/15` with comments. Local refs prove research branches existed, and the canonical contract records the resulting decision, but the original alternatives/evidence are not readable as working-tree documents here.
4. **Prior research branch contents:** materialize commits `d001825421972115db783114e3eb8dfd86ecb4af` and `64d1d37f6b23eed96004684775518909a529c9e7` with Git tooling, without changing the active worktree, to inspect any report or prototype omitted from the current tree.
5. **Maintainer guarantee for event multiplicity:** 0.84.3 source proves continuations emit `agent_start`, and extension docs call it low-level-run start, but an explicit upstream compatibility statement would reduce uncertainty about patch-level changes.

Until those artifacts are retrieved, claims beyond 0.84.3 should be phrased as the repository’s required compatibility contract, not as locally verified Pi behavior.
