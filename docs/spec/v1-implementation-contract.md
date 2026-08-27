# Canonical v1 Implementation Contract

Status: **Frozen for approval**  
Package: `pi-subagents-minimal@1.0.0`  
Contract schema: `1`

This document is the sole normative implementation handoff for v1. The Wayfinder tickets linked in the change-to-evidence map retain rationale and experimental detail; if their wording conflicts with this document, this document controls after approval.

## 1. Product boundary

V1 provides one background **Delegation** containing either one **Subagent** or one **Flat batch** of independent Subagents. Every Subagent uses the exact package-owned `investigation` Agent definition. The validated workflows are repository exploration, evidence-intensive local research, report-only two-axis diff review, and report-only three-lens simplification review.

V1 excludes implementation agents, arbitrary Agent discovery, chains, dependency graphs, nested delegation, intercom, steering, worktrees, scheduling, resumption, child-session persistence, external-web capabilities, unrestricted shell execution, and per-child parent controls. Existing `code-review-diff`, `code-simplify`, and orchestration skills remain outside this package and own their workflow prompts.

Read capability is not a filesystem sandbox: `read`, `grep`, `find`, and `ls` may inspect locally readable resources. The only mutation capability is one closure-bound report writer for one declared Markdown path.

## 2. Supported package and host

### 2.1 Release artifact

The release-qualified install is an exact version:

```sh
pi install npm:pi-subagents-minimal@1.0.0
```

The npm tarball contains only:

- `package.json`, with one explicit `pi.extensions` entry for `./src/index.ts`;
- TypeScript extension/runtime modules loaded directly by Pi through jiti;
- `agents/investigation.md`, selected internally by exact identity and not exposed as a Pi skill or prompt;
- `README.md`, `LICENSE`, and required notices.

A `files` allowlist and packed-artifact test exclude tests, fixtures, parent skills, review roles, prototypes, research assets, and development configuration. V1 has no non-Pi runtime dependency. Pi-provided packages are `"*"` peer dependencies; runtime code otherwise uses Node built-ins.

### 2.2 Compatibility

- Pi: stable `>=0.84.3 <0.85.0`; prereleases are unsupported.
- Node: `>=22.19.0`, with no extension-specific upper bound.
- Bun: development-only, exactly `1.4.0` through `packageManager` and CI.
- Deterministic behavior: macOS, Linux, and Windows.

Before tool registration or resource startup, compare Pi's public `VERSION` export against the supported range. An unsupported or prerelease host emits one bounded `HOST_UNSUPPORTED` diagnostic to stderr, registers neither tool, and starts no resource. Pi remains usable.

Releases are built from a clean tagged commit, test the packed npm artifact, publish only from CI with npm provenance, and record package version, commit, Pi/Node/Bun versions, tarball digest, and applicable Behavioral-battery run.

### 2.3 Versioning

- Patch: fixes preserving tool schemas, persisted formats, capability boundaries, and Agent behavior.
- Minor: compatible additions or material Investigation-definition changes; material Agent changes require the full Behavioral battery.
- Major: incompatible tool/config/schema changes, persisted data that cannot be read transparently, or widened capability.

Every v1 release reads all earlier v1 persisted entries or fails explicitly without silently rewriting them.

## 3. Stable parent surface

Both tools use strict objects with `additionalProperties: false`. String enums use Pi's `StringEnum`; all runtime byte checks use compact UTF-8 encoding rather than JavaScript string length.

Neither tool defines `promptSnippet` nor `promptGuidelines`. Package-owned Investigation instructions never enter the Orchestrator system prompt.

### 3.1 `delegate`

Label: `Delegate`  
Description: `Start one isolated Investigation or a flat batch of independent Investigations in the background. Returns a Delegation id; use delegation_control to inspect or cancel.`

```ts
type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type TaskSpecification = {
  agent: "investigation";
  task: string;
  model?: `${string}/${string}`;
  thinking?: ThinkingLevel;
  reportPath?: string;
};

type DelegateInput =
  | { mode: "single"; task: TaskSpecification }
  | { mode: "batch"; tasks: TaskSpecification[] };
```

Limits:

- `task`: 1–16 KiB UTF-8 per child; 64 KiB total in a batch.
- `model`: 1–256 UTF-8 bytes and exactly one nonempty `provider/model` pair.
- `reportPath`: 1–1,024 UTF-8 bytes.
- `single`: exactly one child.
- `batch`: 2–8 children.

The tool has no cwd, tool, deadline, capability, arbitrary system-prompt, Agent-scope, or Agent-discovery argument. Missing model and Thinking fields independently inherit the Orchestrator values captured at preflight. Unsupported or unauthenticated combinations fail; values are never clamped or substituted.

After whole-request preflight, successful execution returns compact JSON in `content` and `{}` in `details`:

```ts
type AcceptedDelegation = {
  schemaVersion: 1;
  delegationId: string; // "d_" + lowercase crypto.randomUUID()
  phase: "queued";
  taskCount: number;
};
```

### 3.2 `delegation_control`

Label: `Delegation Control`  
Description: `Inspect a live or completed Delegation, or request cancellation of the whole Delegation.`

```ts
type DelegationControlInput = {
  action: "inspect" | "cancel";
  delegationId: string;
};
```

The tool is registered at extension load and inactive by default. It exposes no wait, await, per-child control, result, status, resume, steering, or reply action. Unknown ids are sanitized tool errors. `cancel` returns the inspection produced after processing the request.

A nonterminal call returns compact JSON in `content` and `{}` in `details`:

```ts
type LiveInspection = {
  schemaVersion: 1;
  delegationId: string;
  phase: "queued" | "running" | "cancelling" | "finalizing";
  children: Array<{
    index: number;
    phase: "queued" | "setup" | "running" | "terminal";
  }>;
  diagnostics: HostDiagnostic[];
};
```

A terminal call returns:

```ts
type TerminalInspection = {
  envelope: TerminalEnvelope;
  diagnostics: HostDiagnostic[];
};
```

The nested envelope is byte-identical to the persisted canonical envelope. Subagent output is never duplicated in `details` or constant framing.

### 3.3 Dynamic activation

Every activation update starts from `pi.getActiveTools()` and adds or removes only `delegation_control`. State changes and activation decisions are serialized. The tool is active while at least one Delegation is live or has an unread terminal envelope; it is inactive only when neither condition holds. The extension never restores a stale active-tool snapshot or changes another extension's tools.

Tool addition uses Pi's native deferred representation where supported and Pi's ordinary dynamic-tool fallback elsewhere. Removal uses the normal fallback.

## 4. Startup configuration

Read configuration once during extension initialization:

| Environment variable | Default | Accepted value |
|---|---:|---:|
| `PI_SUBAGENTS_MINIMAL_CONCURRENCY` | `4` | integer 1–4 |
| `PI_SUBAGENTS_MINIMAL_QUEUE_TIMEOUT_MS` | `300000` | integer 1,000–1,800,000 |
| `PI_SUBAGENTS_MINIMAL_SETUP_TIMEOUT_MS` | `30000` | integer 1,000–300,000 |
| `PI_SUBAGENTS_MINIMAL_RUN_TIMEOUT_MS` | `900000` | integer 1,000–7,200,000 |
| `PI_SUBAGENTS_MINIMAL_CANCEL_TIMEOUT_MS` | `30000` | integer 1,000–120,000 |
| `PI_SUBAGENTS_MINIMAL_SHUTDOWN_GRACE_MS` | `30000` | integer 1,000–120,000 |

Whitespace, signs, decimals, exponent notation, non-finite values, leading zeroes, and out-of-range values are invalid. Batch maximum is the fixed constant 8 and has no environment override.

Invalid configuration leaves `delegate` active but disabled: every call fails before registration with the same bounded `[CONFIG_INVALID]` error. It starts no runtime resource. `delegation_control` remains inactive unless startup reconstruction finds a valid unread v1 envelope.

Use monotonic time for deadlines and UTC RFC 3339 timestamps with milliseconds for persisted/model-visible timestamps.

## 5. Preflight and admission

The complete preflight is bounded by the configured Setup timeout and the calling tool's abort signal. It performs, in order:

1. configuration and semantic input validation;
2. exact `investigation` Agent identity validation;
3. report-path validation and duplicate normalized-path rejection across the batch;
4. independent inheritance and resolution of every effective model and Thinking level;
5. current authentication availability checks through the extension-owned public `ModelRuntime`;
6. confirmation that the parent `ctx.sessionManager.isPersisted()`.

Parent extension-registered providers unavailable through the public extension-owned `ModelRuntime` are unsupported in v1; they fail preflight rather than using a private registry seam.

Malformed TypeBox arguments use Pi's standard schema-validation error. Semantic errors throw sanitized `[CODE] message` tool errors:

```ts
type PreflightErrorCode =
  | "CONFIG_INVALID"
  | "INPUT_INVALID"
  | "BATCH_SIZE_INVALID"
  | "AGENT_UNKNOWN"
  | "MODEL_NOT_FOUND"
  | "MODEL_UNAVAILABLE"
  | "THINKING_UNSUPPORTED"
  | "REPORT_PATH_INVALID"
  | "REPORT_PATH_CONFLICT"
  | "PARENT_SESSION_EPHEMERAL"
  | "PREFLIGHT_TIMEOUT";
```

No id, child, queue entry, session, or report mutation exists after failed preflight.

After successful whole-request preflight:

1. generate the Delegation id;
2. synchronously register every child in input order;
3. assign all children the same registration timestamp and Queue deadline;
4. append children to the extension-wide FIFO behind earlier registrations;
5. activate `delegation_control`;
6. return `AcceptedDelegation` immediately.

## 6. Report-path and writer contract

### 6.1 Declared path

A declared report path:

- is a normalized relative portable path using `/` separators;
- begins with `artifacts/` and ends case-sensitively in `.md`;
- resolves against the Orchestrator's initial `ctx.cwd`;
- contains no empty, `.`, or `..` segment and no backslash;
- is not absolute under POSIX, drive-letter, UNC, or device-path syntax;
- has a canonical existing ancestor and final canonical target inside `<initial cwd>/artifacts`;
- does not traverse a symlink, junction, or reparse point outside that root.

Preflight validates the boundary. The writer revalidates immediately before mutation and projection revalidates the completed regular file. Duplicate normalized targets in one batch are rejected.

### 6.2 Child-only `write_report`

A report task receives one custom tool in addition to read capabilities:

```ts
type WriteReportInput = {
  content: string; // UTF-8 Markdown, 1 byte–1 MiB
};
```

The declared path is closure-bound and never model-selectable. Failed attempts may retry. After one successful write, further calls fail with `REPORT_ALREADY_WRITTEN`. The tool returns only compact `{path, bytesWritten}`.

Within Pi's `withFileMutationQueue()` for the absolute target, the writer:

1. revalidates the path boundary;
2. creates missing parent directories inside the report root;
3. writes UTF-8 Markdown to a private same-directory temporary file;
4. atomically renames it over the target where supported;
5. fails closed rather than using an unguarded delete/write fallback;
6. removes temporary residue best-effort.

Temporary cleanup faults become `REPORT_TEMP_CLEANUP_FAILED` Host diagnostics. A report task succeeds only when one write succeeded and the final target is still a safely resolved regular file.

## 7. Child runtime and capability matrix

| Resource | No report | Declared report |
|---|---|---|
| Built-in tools | `read`, `grep`, `find`, `ls` | same |
| Custom tools | none | `write_report` |
| Extensions | none | none |
| Skills, prompts, themes | none | none |
| Parent messages | none | none |
| Agent instructions | exact packaged Investigation definition | same |
| Context files | filtered repository context | same |

For each child:

- use public `createAgentSession()`;
- use a fresh `SessionManager.inMemory(ctx.cwd)` and never open, continue, resume, fork, or inject parent messages;
- use `SettingsManager.inMemory()` with automatic retry enabled for at most two retries and automatic compaction enabled;
- bound provider request timeout, retry delay, retries, and compaction by the remaining Running deadline;
- inherit no project model, Thinking, tool, transport, or settings value;
- use a restricted, explicitly reloaded `DefaultResourceLoader` with extensions, skills, prompt templates, and themes disabled;
- append the exact package Agent definition with `appendSystemPrompt`;
- discover the nearest `.git` ancestor as repository boundary, falling back to `ctx.cwd`, and retain only standard Pi context files whose canonical paths are inside it;
- exclude global and above-repository context files;
- use the extension-owned public `ModelRuntime`, resolved model, exact Thinking level, and strict tool allowlist;
- subscribe only for invocation-boundary completion evidence;
- always unsubscribe, abort if needed, dispose, and release references in `finally`.

A Concurrency slot is acquired before resource loading and held through child settlement and cleanup. Queued children hold no slot.

### 7.1 Exact Investigation behavior

`agents/investigation.md` must normatively instruct the Subagent to:

1. investigate only the bounded Task specification;
2. gather evidence before concluding and distinguish facts, recommendations, and uncertainty;
3. use only supplied capabilities and never attempt nested delegation;
4. avoid file mutation unless `write_report` is present;
5. return the concise requested answer when no report is declared;
6. when a report is declared, complete exactly one successful `write_report` call with the complete Markdown evidence, retrying only a failed attempt, then return only a concise summary and declared path;
7. cite exact paths, symbols, and local sources when requested;
8. never claim access, execution, writes, or verification that did not occur;
9. stop when the requested answer is established instead of broadening scope.

Tests compare the packaged file bytes with the contract fixture. A material behavioral change requires at least a minor release and the full Behavioral battery.

## 8. Scheduling and lifecycle

### 8.1 Deadlines and FIFO

- Maximum Flat batch: 8 children.
- Extension-wide Concurrency slots: default 4, configurable 1–4.
- One strict FIFO spans all Delegations in registration and input order.
- Queue deadline: from registration, default 5 minutes.
- Setup deadline: after slot acquisition through resource loading, session creation, and prompt acceptance, default 30 seconds.
- Running deadline: from Pi prompt acceptance through settlement, default 15 minutes.
- Cancellation settlement: one shared Delegation clock, default 30 seconds.
- Graceful shutdown: one global clock, default 30 seconds.

`session.prompt(..., {preflightResult})` is the acceptance boundary. `true` ends setup, starts the Running deadline, and moves the child to `running`; `false` produces `PROMPT_REJECTED`.

### 8.2 Legal transitions

Every unlisted transition is illegal.

Delegation:

```text
queued    -> running | cancelling | finalizing
running   -> cancelling | finalizing
cancelling -> finalizing
finalizing -> terminal
```

Child:

```text
queued  -> setup | cancelled | timed_out
setup   -> running | failed | timed_out | cancelled
running -> succeeded | failed | timed_out | cancelled
```

Delegation `running` begins when any child prompt is accepted and may coexist with queued/setup siblings. `finalizing` begins only when every child outcome is immutable and no Subagent remains live. Failed persistence self-loops in `finalizing`. `terminal` begins only after successful terminal-envelope append.

Child terminal transitions are atomic first-transition-wins. A terminal result observed first wins; otherwise the first accepted timeout or cancellation claim wins. Already-terminal children are never rewritten and late results are rejected.

### 8.3 Truthful phases

Parent-visible Delegation phases are only `queued`, `running`, `cancelling`, `finalizing`, and `terminal`. Child inspection adds `setup`. V1 exposes no percentage, ETA, inferred progress, silence-based stall, tool-count, transcript-derived activity, or completion order.

### 8.4 Flat-batch settlement and outcomes

Flat batches are all-settled. A child failure or timeout never cancels an independent sibling. The aggregate becomes terminal only after every child is terminal and the canonical envelope persists. Child outcomes always appear in original input order with zero-based indexes.

Child outcomes:

- `succeeded`
- `failed`
- `timed_out`
- `cancelled`

Delegation outcome precedence:

1. accepted Delegation cancellation while execution remained live → `cancelled`;
2. every child succeeded → `succeeded`;
3. at least one succeeded and at least one did not → `partial`;
4. every child timed out → `timed_out`;
5. otherwise → `failed`.

### 8.5 Cancellation

Parent control cancels the whole Delegation. Cancellation immediately:

- prevents queued/setup children from advancing;
- aborts running sessions;
- transitions the Delegation to `cancelling`;
- starts one shared settlement deadline only on the first accepted request.

At deadline, dispose remaining sessions, classify affected children `cancelled`, release references, and reject later results. This guarantees bounded host settlement, not physical termination of arbitrary non-cooperative in-process I/O.

Cancellation is idempotent. Repetition does not extend the deadline. Cancellation during `finalizing` is a no-op returning `finalizing`; after terminal it returns the unchanged terminal inspection.

## 9. Projection and canonical terminal envelope

### 9.1 Terminal-message projection

Record the message boundary before prompt acceptance. After settlement, scan only later messages and select the final assistant message. Join nonempty text blocks in source order with `\n\n`, then trim outer Unicode whitespace.

| Evidence | Child classification |
|---|---|
| `stopReason: "stop"` and nonempty projected text or valid report | candidate `succeeded` |
| `length` | `failed`, `OUTPUT_LENGTH`, useful text as `partialResult` |
| `error` | `failed`, `RUN_FAILED`, useful text as `partialResult` |
| `aborted` after winning host cancellation | `cancelled`, no partial text |
| other `aborted` | `failed`, `RUN_FAILED` |
| `toolUse`, missing assistant message, or empty text | `failed`, `OUTPUT_MISSING` |
| missing/unsafe required report | `failed`, `REPORT_MISSING` or `REPORT_WRITE_FAILED` |

A no-report success uses `result`; a report success uses the projected text as `report.summary` and the normalized declared path as `report.path`.

### 9.2 Child errors

```ts
type ChildErrorCode =
  | "QUEUE_TIMEOUT"
  | "SETUP_TIMEOUT"
  | "RESOURCE_LOAD_FAILED"
  | "SESSION_CREATE_FAILED"
  | "PROMPT_REJECTED"
  | "RUN_TIMEOUT"
  | "RUN_FAILED"
  | "OUTPUT_LENGTH"
  | "OUTPUT_MISSING"
  | "REPORT_MISSING"
  | "REPORT_WRITE_FAILED"
  | "CANCELLED"
  | "PROJECTION_FAILED";

type ChildError = {
  stage: "queue" | "setup" | "run" | "projection";
  code: ChildErrorCode;
  message: string; // <=512 UTF-8 bytes
};
```

Queue/setup/run timeout codes map to their same-named stage. Resource/session/prompt errors map to setup. Runtime, output-length, and report-writer errors map to run. Missing output/report and envelope conversion errors map to projection. Cancellation uses the child phase in which its claim won. Raw exception classes, stacks, credentials, headers, and arbitrary provider payloads are never exposed.

Every non-success child has `error`. Only failed/timed-out children may also have a bounded `partialResult`; cancelled children never do.

### 9.3 Envelope schema

```ts
type TerminalEnvelope = {
  schemaVersion: 1;
  delegationId: string;
  outcome: "succeeded" | "partial" | "failed" | "timed_out" | "cancelled";
  completedAt: string;
  taskCount: number;
  order: "input";
  children: ChildOutcome[];
};

type ChildOutcome = {
  index: number;
  outcome: "succeeded" | "failed" | "timed_out" | "cancelled";
  effectiveModel: `${string}/${string}`;
  effectiveThinking: ThinkingLevel;
  result?: string;
  report?: { path: string; summary: string };
  partialResult?: string;
  error?: ChildError;
  truncation?: {
    field: "result" | "report.summary" | "partialResult";
    originalBytes: number;
    retainedBytes: number;
  };
};
```

Exactly one of `result` or `report` exists on success. Neither exists on non-success. Task prompts, transcripts, usage, completion order, and internal absolute paths are excluded.

### 9.4 Size limits

- Single successful text: 16 KiB UTF-8.
- Failed/timed-out `partialResult`: 4 KiB UTF-8.
- Error message: 512 UTF-8 bytes.
- Flat-batch variable-text pool: 24 KiB.
- Complete compact canonical envelope: 32 KiB.

For allocation:

1. encode every candidate result, report summary/path, partial result, and truncation metadata as UTF-8;
2. apply the 16 KiB/4 KiB field cap;
3. for a batch, repeatedly divide remaining pool by fields still needing bytes, in input order; short fields consume actual bytes and release the remainder;
4. assign indivisible remainder bytes one at a time in input order;
5. truncate only at valid UTF-8 boundaries and state original/retained byte counts;
6. include report paths and truncation metadata in the 24 KiB accounting;
7. compact-serialize and, if over 32 KiB, reduce variable text deterministically in reverse input order;
8. if fixed metadata cannot fit, replace affected projections with bounded `PROJECTION_FAILED` outcomes.

Never persist or return an oversized envelope.

## 10. Host diagnostics

Host faults never rewrite child or Delegation outcomes.

```ts
type HostDiagnostic = {
  stage:
    | "configuration"
    | "compatibility"
    | "persistence"
    | "cleanup"
    | "lifecycle";
  code:
    | "CONFIG_INVALID"
    | "HOST_UNSUPPORTED"
    | "TERMINAL_PERSIST_FAILED"
    | "CONSUMED_MARKER_PERSIST_FAILED"
    | "PERSISTED_ENTRY_UNREADABLE"
    | "COMPLETION_NOTIFY_FAILED"
    | "CHILD_ABORT_FAILED"
    | "CHILD_DISPOSE_FAILED"
    | "REPORT_TEMP_CLEANUP_FAILED"
    | "LATE_RESULT_REJECTED";
  message: string;
  at: string;
};
```

Each message is at most 512 UTF-8 bytes. One inspection exposes at most eight diagnostics and 4 KiB compact JSON. Retain newest diagnostics after deterministic deduplication by `{stage, code, message}`. Diagnostics generated after terminalization appear outside the immutable envelope.

## 11. Persistence, retrieval, and notification

### 11.1 Persist-first terminalization

Terminalization order is:

1. project the canonical envelope;
2. append it synchronously with Pi's public API:

   ```ts
   pi.appendEntry("pi-subagents-minimal:terminal", terminalEnvelope);
   ```

3. only after successful append, transition `finalizing → terminal`;
4. activate `delegation_control` if needed;
5. unless shutdown is active, send one completion message.

Successful `appendEntry()` is the durability boundary; v1 makes no fsync claim. If append throws, remain `finalizing`, send no completion, retain the immutable candidate envelope in memory, expose `TERMINAL_PERSIST_FAILED`, and retry on inspect and graceful shutdown.

### 11.2 Completion message

After persistence, send exactly:

```text
Delegation <id> completed: <outcome>. Use delegation_control inspect to retrieve it.
```

with:

```ts
pi.sendMessage(
  {
    customType: "pi-subagents-minimal:completion",
    content,
    display: true,
  },
  { deliverAs: "steer", triggerTurn: true },
);
```

Send at most once for an in-process terminalization and never replay solely because reload reconstructed an unread envelope. A send failure leaves the result terminal and unread, keeps control active, and adds `COMPLETION_NOTIFY_FAILED`; it is not retried automatically.

### 11.3 Consumption marker

Before returning a terminal envelope from `inspect`, append a marker when no valid matching marker exists:

```ts
pi.appendEntry("pi-subagents-minimal:consumed", {
  schemaVersion: 1,
  delegationId,
  envelopeSha256,
  consumedAt,
});
```

`envelopeSha256` is lowercase SHA-256 of the exact compact UTF-8 envelope JSON returned by inspection. Marker failure returns the envelope plus `CONSUMED_MARKER_PERSIST_FAILED`, leaves it unread, and permits safe duplicate delivery. Success marks it read and allows control removal when no other live/unread Delegation exists.

A known consumed id remains inspectable and returns the same byte-identical envelope without appending another valid marker.

### 11.4 Reconstruction and branching

On `session_start`, scan `ctx.sessionManager.getBranch()` in order. Validate custom type, schema, size, ids, digest, and marker ordering. Reconstruct valid terminal envelopes and matching consumption state. Unknown schema versions, malformed entries, or digest mismatches never mutate state and produce bounded `PERSISTED_ENTRY_UNREADABLE` diagnostics; entries are never rewritten.

Only the active branch is authoritative. Results abandoned on another Pi conversation branch do not reactivate control. Live child work is never resumed.

## 12. Graceful shutdown

The idempotent `session_shutdown` handler:

1. stops admission and rejects new Delegations;
2. atomically accepts cancellation for every live Delegation;
3. prevents queued/setup advancement and aborts running sessions;
4. starts one global Shutdown grace clock;
5. continues classification/finalization and retries terminal-envelope persistence within that clock;
6. at expiry, disposes remaining sessions, classifies unsettled children `cancelled`, rejects late results, makes one final synchronous persistence attempt, and releases references;
7. appends no consumed markers and sends no completion messages during shutdown.

Already persisted unread envelopes remain untouched. Cleanup faults are bounded Host diagnostics and cannot rewrite outcomes. Abrupt process failure may lose work that did not reach a persisted terminal envelope.

## 13. Parent-context budgets

Independent hard gates:

| Surface | Implementation target | Hard ceiling |
|---|---:|---:|
| Stable initial `delegate` payload | 3,072 B | 4,096 B |
| Added parent system-prompt text | 1,125 chars | 1,500 chars |
| Fresh-session Added context cost | 1,125 tokens | 1,500 tokens |
| Dynamic `delegation_control` payload | 1,536 B | 2,048 B |
| Both extension tools active | 4,608 B | 6,144 B |

Payloads are compact provider-facing UTF-8 JSON. CI measures otherwise-identical fresh requests with no extension tools, only `delegate`, and both tools active from startup. The token protocol is Pi 0.84.3, `openai-codex/gpt-5.6-sol`, medium Thinking, fresh no-session project, and `Reply with exactly OK.`, repeated twice.

Every ceiling breach fails CI. Deterministic payload/prompt growth over 10% from the committed baseline requires explicit justification and reviewed baseline update. Both token repetitions must pass the absolute ceiling. A baseline update cannot raise a ceiling; raising one reopens the specification decision.

## 14. Verification protocol

### 14.1 Deterministic lifecycle conformance

Run without a live model through the highest stable public extension boundary, using controlled clocks, child-session fakes, persistence faults, and forced settlement order. Every implementation must first obtain red proof for each case.

1. **Out-of-order Flat batch:** C succeeds, A succeeds, B fails with useful text; one input-ordered `partial` envelope, visible bounded B `partialResult`, and one persist-first notification.
2. **Unread terminal recovery:** reload before inspection reconstructs an unread byte-identical envelope and activates control.
3. **Duplicate retrieval:** one marker append failure permits duplicate identical delivery; successful marker consumes and removes control only when otherwise idle.
4. **Queued cancellation:** capacity-blocked child never starts, settles cancelled, releases queue state, and repeated cancellation is idempotent.
5. **Running cancellation:** completed sibling survives; live sibling enters cancelling; shared deadline disposes references, rejects late result, and aggregate is cancelled.
6. **Persistence fault:** failed terminal append leaves finalizing, sends no completion, exposes a bounded diagnostic, and retries without rewriting child outcomes.
7. **Deadline stages:** independently expire queue, setup, and run clocks with exact stage/code while siblings continue.
8. **Preflight rejection:** unknown Agent, unusable model/auth, unsupported Thinking, oversized batch/text, duplicate/unsafe report path, ephemeral parent, invalid config, and timeout return no id and start no child.
9. **Terminal races:** result/cancel and result/timeout in both orders obey atomic first-transition-wins and reject late results.
10. **Graceful shutdown:** live and unread Delegations coexist; one global grace applies, live work is cancelled, persist-before-exit is attempted, and persisted unread envelopes survive reload.
11. **Notification failure:** persisted result remains terminal/unread and inspectable with `COMPLETION_NOTIFY_FAILED`.
12. **Capability isolation:** exact tool/resource matrix, no parent messages, no arbitrary Agent/extension/skill loading, and writer closure/path enforcement.
13. **Projection bounds:** UTF-8 boundary cases, water-filling reference model, 16/4/24/32 KiB boundaries, sanitized errors, and no content duplication.
14. **Branch semantics:** only active-branch valid envelopes/markers reconstruct; unknown versions and digest mismatches fail explicitly.

### 14.2 Provider-backed Behavioral battery

The release claim is limited to the exact recorded Pi version and `openai-codex/gpt-5.6-luna` at low, medium, and high Thinking. It does not establish general model compatibility, model quality, or implementation capability.

Run four scenarios three times at each Thinking level: 36 Workflow trials and 63 child sessions. Every scenario/Thinking cell must pass 3/3. No model judges another model. Record fixture commit, exact prompts, effective tuples, Pi/package versions, event streams, envelopes, usage, wall time, and human binary oracle.

Frozen prompts:

**Repository exploration**

> Using only repository files, locate where `DefaultResourceLoader` combines explicitly supplied `additionalSkillPaths` with automatically discovered skill paths. Return the exact file paths and symbols, explain precedence, and stay within 180 words. Do not modify files.

**Evidence-intensive research**

> Using the official documentation and implementation in this repository, establish the minimum conditions under which `createAgentSession` starts without inherited conversation messages. Distinguish conversation isolation from project-context loading. Cite an exact file and line range for every material claim, separate facts from recommendations, and identify uncertainty rather than guessing. Write the full evidence to `artifacts/session-isolation.md`; return only a concise summary and that path. Do not modify any other file.

**Two-axis diff review**

> Review the changes since tag `battery-base` using `code-review-diff`. Use `docs/spec.md` as the originating specification and the repository’s documented standards. Report Standards and Spec separately. Do not modify files.

**Three-lens simplification**

> Review the fixture’s uncommitted changes using `code-simplify`. Report Reuse, Quality, and Efficiency separately. Do not modify files.

The simplification harness prepares an equivalent uncommitted working-tree diff even when its captured fixture stores base/head snapshots. The oracle manifest remains outside Subagent-visible context.

Frozen oracles:

- **Exploration:** deterministically enforce read-only behavior, the 180-word bound, and citations resolving inside the pinned fixture. Human semantic checks require `DefaultResourceLoader.loadSkills()` and `mergePaths()`; enabled/discovered paths precede `additionalSkillPaths`; canonical duplicates keep the earliest path; additional paths still load with normal discovery disabled. Invented symbols or unsupported precedence fail.
- **Research:** deterministically require exactly one successful write at `artifacts/session-isolation.md`, concise terminal summary/path rather than report duplication, and existing cited paths/line ranges. Human semantic checks require fresh `SessionManager.inMemory()`, no resume/fork or parent-message injection, explicit separation of conversation history from `DefaultResourceLoader` project context, and stated uncertainty. Uncited material claims, other mutation, or hidden uncertainty fail.
- **Two-axis review:** Standards and Spec run independently in one Flat batch. Deterministic checks require report-only behavior, separate headings, one aggregate, and input order under forced reverse completion. The hidden critical inventory requires Standards to catch forbidden `any`, bypass of `safeJoin`, query-side mutation, and sequential independent reads; Spec must catch path escape, missing `UserNotFound`, the unrequested write, and removal/scope creep beyond the requested API. Findings must be diff-grounded; fabricated hard findings fail.
- **Three-lens simplification:** three independent children inspect the same diff. Deterministic checks require report-only behavior and separate Reuse, Quality, and Efficiency outputs. The hidden inventory requires Reuse to find existing `safeJoin` and redundant profile read; Quality to find the query side effect and over-broad/stringly error/state shape; Efficiency to find duplicate read, sequential independent reads, and recurring write. Findings must be grounded; style-only noise cannot become a blocker and unsupported performance claims fail.

A human scores only predeclared binary present/correct/grounded checks. If a predeclared ambiguity proves the oracle wrong, revise the oracle first and rerun the affected cell; never waive a failed run after seeing its answer. Versioned harness fixtures copy these prompts and inventories without semantic alteration.

Cadence:

- deterministic conformance and frozen-fixture oracle checks: every PR;
- low-Thinking seven-child sweep: weekly/manual, non-blocking drift alert;
- full matrix: blocking before release and after material Agent, prompt, fixture, Pi runtime, model, Thinking mapping, or participating review-skill changes;
- unrelated PRs: no provider-backed trials.

### 14.3 Packed release gates

Every release candidate, tested from the packed artifact, must pass:

1. Bun unit and type tests;
2. deterministic lifecycle conformance;
3. packed smoke tests on macOS, Linux, and Windows;
4. fresh exact-version `pi install` verification;
5. Pi 0.84.3 and latest supported 0.84.x smoke/type checks;
6. rejection below 0.84.3, at 0.85.0, and on prereleases;
7. Node 22.19.0 and newest active-LTS checks;
8. tarball allowlist, license, and undeclared-runtime-dependency checks;
9. context-budget and drift gates;
10. provider-backed battery at its frozen cadence.

## 15. Change-to-evidence map

| Contract assertion | Originating decision | Required evidence |
|---|---|---|
| Public `createAgentSession`, fresh in-memory child, public ModelRuntime, invocation-boundary projection, abort/dispose | [Determine the minimum correct Pi child-session runtime](https://github.com/Blaise-g/pi-subagents-minimal/issues/4) | child integration, isolation, stop-reason, cancellation, cleanup tests |
| Exact Investigation ownership and no arbitrary Agent discovery | [Place research and exploration instructions](https://github.com/Blaise-g/pi-subagents-minimal/issues/5) | packaged-byte test, resource/capability isolation, full battery after material change |
| One permanent launch tool, dynamic inspect/cancel, persist-first inbox, steering notification | [Define the minimal background lifecycle contract](https://github.com/Blaise-g/pi-subagents-minimal/issues/6) | dynamic-tool, recovery, notification ordering/failure tests |
| 8-child/4-slot FIFO, deadlines, all-settled ordering, outcome precedence, cancellation races, shutdown | [Define concurrency, cancellation, and failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/7) | controlled-clock/state-machine/reference-scheduler tests with red proof |
| Explicit partial/timeout outcomes, finalizing, visible partial result, separate Host diagnostics | [Compare v1 and Arhen failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/12) | exact envelope and persistence/cleanup fault tests |
| 4/2/6 KiB tool budgets, 1,500-token/prompt bounds, 16/4/24/32 KiB envelope bounds, drift policy | [Set the v1 context budget](https://github.com/Blaise-g/pi-subagents-minimal/issues/8) | payload snapshots, provider token protocol, UTF-8 boundary/property tests, independent water-fill model |
| Four workflows, Luna low/medium/high claim, deterministic lifecycle matrix, cadence | [Freeze the workflow behavioral battery](https://github.com/Blaise-g/pi-subagents-minimal/issues/9) | frozen fixture/oracle harness and recorded 36-trial release run |
| Local read-only Investigation, closure-bound Markdown report, preflight completeness, `triggerTurn: true` | [Approve the v1 implementation specification](https://github.com/Blaise-g/pi-subagents-minimal/issues/10) | forbidden-capability, unsafe path, preflight no-id/no-start, idle/active notification tests |
| Exact npm artifact, Pi/Node/Bun boundary, platform matrix, upgrade/release policy | [Set the v1 packaging and compatibility boundary](https://github.com/Blaise-g/pi-subagents-minimal/issues/11) | packed-install/platform/version/tarball/provenance gates |
| Exact schemas, config, entries, envelopes, codes, paths, transitions, and evidence map | [Freeze the canonical v1 implementation contract](https://github.com/Blaise-g/pi-subagents-minimal/issues/13) | schema snapshots plus an assertion-to-test inventory covering every section above |

Tests follow anchor-before-assertion: this contract and its named source decisions are the external anchors. AI variability is tested only in Workflow trials. Lifecycle, serialization, security, path, compatibility, and packaging claims remain deterministic. Every new behavior requires a defect-revealing red proof before green verification; implementation branches without a contract anchor are not allowed to define expected behavior.
