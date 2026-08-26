# Findings: v1 versus Arhen 1.3.46 failure semantics

## Verdict

**Keep the selected v1 semantics.** In the controlled scenarios they are clearer, more bounded, and more recoverable than Arhen 1.3.46. The extra lifecycle concepts are justified because each closes a concrete ambiguity:

- `partial` preserves the aggregate meaning of mixed success instead of collapsing it to `failed`.
- `timed_out` plus `queue | setup | run | projection` distinguishes resource starvation from startup, execution, and output failures.
- Labelled `partialResult` makes failed-child evidence visible without treating it as success.
- `cancelling` prevents a control acknowledgement from pretending cleanup has settled.
- `finalizing` prevents a completion notice from pretending a result is persisted.
- queue/setup/running/settlement deadlines bound states Arhen leaves unbounded or reports terminal before cleanup.
- persist-before-terminal plus inspect/shutdown retries turns persistence failure into an observable recovery path.

No additional lifecycle state or parent-facing tool is warranted. V1 remains narrower than Arhen: one `delegate` tool plus one dynamic `delegation_control` tool, whole-Delegation cancellation, and no per-child notifications, waiting tool, steering, intercom, chain, or graph.

## Controlled scenario results

| Scenario | v1 | Arhen 1.3.46 | Decision impact |
|---|---|---|---|
| Mixed Flat batch | `partial`; successful outputs and labelled failed `partialResult` remain visible | aggregate `failed`; successful outputs remain, but `makeSummary` chooses `error` over salvaged `finalText` for the failed child | Keep `partial` and `partialResult` |
| Running deadline | first-class `timed_out` at `run` | task/run label `failed`; timeout survives only in error text | Keep timeout outcome and stage |
| Capacity starvation | 5-minute queue deadline settles the child independently | per-run queue has no queue deadline; `maxRuntimeMs` starts around child prompting | Keep Queue deadline and extension-wide slots |
| Cancellation race | `cancelling` until abort/cleanup settles or the 30-second settlement deadline fires | `cancelRun` marks and settles the run `aborted` immediately, while child catch/finally may still be aborting, salvaging, committing, and disposing | Keep `cancelling` and settlement deadline |
| Persistence fault | remains `finalizing`, sends no completion, retains envelope, retries on inspect/shutdown | completion/settlement precedes best-effort async sidecar persistence; write errors are swallowed | Keep `finalizing` and persist-before-terminal |
| Unusable requested model | reject before registration, no silent substitution | preflight may fall back to the parent session model and records a note | Keep fail-closed preflight |
| Out-of-order completion | all-settled and input-ordered | all-settled and input-ordered | Do not claim a v1 advantage here |

## One specification clarification before the battery freezes

Make `inspect` distinguish **host lifecycle diagnostics** from child outcomes in its schema, not only in prose. In particular, while a Delegation is `finalizing`, expose a bounded diagnostic such as:

```ts
hostDiagnostic?: {
  stage: "persistence" | "cleanup";
  code: "terminal_append_failed" | "cleanup_failed";
  message: string;
}
```

This is a clarification, not a new terminal state: persistence and cleanup failures must not rewrite immutable child or aggregate outcomes. The field gives the promised inspect retry path a deterministic oracle for the behavioral battery. Keep provider/tool details sanitized and bounded, and do not expose raw exception classes.

Also state explicitly that `partialResult` is returned alongside `error` for failed/timed-out children when useful bounded text exists. Otherwise an implementation could repeat Arhen's projection bug—retaining partial text internally while suppressing it from the model-visible result.

## Source anchors

Arhen package: `@arhen/pi-core-subagent@1.3.46`, source commit [`de266e7c`](https://github.com/arhen/pi-extensions/tree/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent).

- Terminal labels and limits: [`src/types.ts`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/types.ts), [`src/manager.ts#L58-L79`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L58-L79).
- Stop-reason classification: [`manager.ts#L120-L145`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L120-L145).
- Runtime timeout and failed-child salvage: [`manager.ts#L1075-L1204`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L1075-L1204).
- Aggregate classification and all-settled/input-order behavior: [`manager.ts#L1372-L1477`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L1372-L1477).
- Immediate cancellation settlement: [`manager.ts#L1540-L1594`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L1540-L1594).
- Best-effort async sidecar persistence: [`manager.ts#L482-L516`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L482-L516).
- Summary suppresses `finalText` when `error` exists: [`format.ts#L223-L251`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/format.ts#L223-L251).
- Unusable requested-model fallback: [`manager.ts#L217-L234`](https://github.com/arhen/pi-extensions/blob/de266e7cda20c312f19e26cca2a3b1c20b8234e5/packages/core/pi-core-subagent/src/manager.ts#L217-L234).

V1 anchor: [Define concurrency, cancellation, and failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/7), especially its child/aggregate outcomes, cancellation races, finalization/persistence, and shutdown sections.

## Limits

- The prototype compares semantics and model comprehension, not empirical defect rates.
- Arhen has broader goals and deliberately exposes richer controls; this comparison judges only the narrower v1 destination.
- Persistence crash windows cannot be proven away by a deterministic projection. The v1 claim remains successful synchronous `appendEntry()` return—not `fsync`.
