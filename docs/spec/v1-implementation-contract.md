# Canonical Implementation Contract

Status: **Approved for implementation**
Current implementation target: `pi-subagents-minimal@0.2.0`
Future stable release target: `pi-subagents-minimal@1.0.0`
Contract revision: `2`

This document is the sole normative implementation handoff. It incorporates the approved `0.2.0` decisions in [issue #40](https://github.com/Blaise-g/pi-subagents-minimal/issues/40). Earlier issues and the retained [proposal](v0.2-generic-subagent-capabilities-proposal.md) and [review](v0.2-generic-subagent-capabilities-review.md) are historical design evidence; this contract controls when wording conflicts.

## 1. Product boundary

The package provides one background **Delegation** containing either one **Subagent** or one **Flat batch** of independent Subagents. Every Subagent uses the exact package-owned role-neutral definition. Parent skills own temporary Task roles or analytical lenses and express them only in the opaque `task` prompt; such content grants no capability, selects no definition, and receives no semantic runtime validation. The supported workflows are bounded repository exploration and local research, report-only two-axis diff review, and report-only three-lens simplification review.

`0.2.0` excludes implementation agents, Agent catalogs and arbitrary Agent discovery, arbitrary parent/global tool forwarding, chains, dependency graphs, nested delegation, intercom, steering, worktrees, scheduling, resumption, child-session persistence, external web access, Bash, PowerShell, test/check execution, generic Git, unrestricted shell execution, and per-child parent controls. Guarded command execution and web access require later specifications. Existing `research`, `code-review-diff`, `code-simplify`, and orchestration skills remain outside this package and own their workflow prompts.

Read capability is not a filesystem sandbox: `read`, `grep`, `find`, and `ls` may inspect locally readable resources. `git_diff` is a package-owned bounded inspection tool, not command execution. The only intentional mutation capability is one closure-bound report writer for one declared Markdown path.

## 2. Supported package and host

### 2.1 Release artifact

The release-qualified install is an exact version:

```sh
pi install npm:pi-subagents-minimal@1.0.0
```

The npm tarball contains only:

- `package.json`, with one explicit `pi.extensions` entry for `./extensions/subagents-minimal.ts`;
- TypeScript extension/runtime modules loaded directly by Pi through jiti;
- `agents/subagent.md`, the sole role-neutral definition, selected internally by exact identity and not exposed as a Pi skill or prompt;
- `README.md`, `LICENSE`, and required notices.

A `files` allowlist and packed-artifact test exclude tests, fixtures, parent skills, review roles, prototypes, research assets, and development configuration. `0.2.0` has no non-Pi runtime dependency. Pi-provided packages are `"*"` peer dependencies; runtime code otherwise uses Node built-ins.

### 2.2 Compatibility

- Pi: stable `>=0.84.3 <0.85.0`; prereleases are unsupported.
- Node: `>=22.19.0`, with no extension-specific upper bound.
- Bun: development-only, exactly `1.4.0` through `packageManager` and CI.
- Deterministic behavior: macOS, Linux, and Windows.

Before tool registration or resource startup, compare Pi's public `VERSION` export against the supported range. An unsupported or prerelease host emits one bounded `HOST_UNSUPPORTED` diagnostic to stderr, registers neither tool, and starts no resource. Pi remains usable.

Releases are built from a clean tagged commit, test the packed npm artifact, publish only from CI with npm provenance, and record package version, commit, Pi/Node/Bun versions, and tarball digest. Releases qualify deterministic behavior and compatibility; they do not certify model-output quality.

### 2.3 Versioning

- Patch: fixes preserving tool schemas, persisted formats, capability boundaries, and Agent behavior.
- Minor: compatible additions or Significant behavioral changes. The pre-release schema correction and bounded Git capability produce `0.2.0`.
- Major: incompatible stable tool/config/schema changes, persisted data that cannot be read transparently, or widened capability.

Every release reads supported earlier persisted entries or fails explicitly without silently rewriting them. New `0.2.0` Terminal envelopes use schema version 2; legacy version 1 envelopes remain readable and byte-identical.

## 3. Stable parent surface

Both tools use strict objects with `additionalProperties: false`. String enums use Pi's `StringEnum`; all runtime byte checks use compact UTF-8 encoding rather than JavaScript string length.

Neither tool defines `promptSnippet` nor `promptGuidelines`. Package-owned Subagent instructions never enter the Orchestrator system prompt.

### 3.1 `delegate`

Label: `Delegate`  
Description: `Start one isolated Subagent or a flat batch of independent Subagents in the background. Returns a Delegation id; use delegation_control to inspect or cancel.`

```ts
type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

type AdditionalTool = "git_diff";

type TaskSpecification = {
  task: string;
  tools?: AdditionalTool[];
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

Both Task and tool-input objects are strict (`additionalProperties: false`). The tool has no cwd, deadline, arbitrary system prompt, Agent selector, Agent discovery, or arbitrary capability argument. `tools` is additions-only: omission and `[]` are equivalent, repeated legal names are deduplicated idempotently, and any unknown name fails before admission. Missing model and Thinking fields independently inherit the Orchestrator values captured at preflight. Unsupported or unauthenticated combinations fail; values are never clamped or substituted. The exact Unicode `task` bytes become the child user message unchanged, with skill and prompt-template expansion disabled.

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

Invalid configuration leaves `delegate` active but disabled: every call fails before registration with the same bounded `[CONFIG_INVALID]` error. It starts no runtime resource. `delegation_control` remains inactive unless startup reconstruction finds a valid unread version 1 or version 2 envelope.

Use monotonic time for deadlines and UTC RFC 3339 timestamps with milliseconds for persisted/model-visible timestamps.

## 5. Preflight and admission

The complete preflight is bounded by the configured Setup timeout and the calling tool's abort signal. It performs, in order:

1. configuration and semantic input validation;
2. exact package-owned Subagent-definition identity validation;
3. canonicalization of legal additional tools and rejection of unknown names;
4. if any Task requests `git_diff`, confirmation of a supported Git executable and usable nearest repository;
5. report-path validation and duplicate normalized-path rejection across the batch;
6. independent inheritance and resolution of every effective model and Thinking level;
7. current authentication availability checks through the extension-owned public `ModelRuntime`;
8. confirmation that the parent `ctx.sessionManager.isPersisted()`;
9. protected-envelope feasibility using every resolved effective model/Thinking tuple, every complete declared report path, every complete canonical effective-tool list, fixed canonical framing, and the maximum non-truncatable representation of each legal child outcome.

The feasibility check reserves report paths in full and proves that at least one legal bounded canonical representation remains beneath both the 24 KiB pool and 32 KiB envelope ceilings. It is conservative: truncatable model output contributes no assumed capacity. A request that cannot satisfy the proof is rejected before registration; report paths are never shortened to admit it.

Parent extension-registered providers unavailable through the public extension-owned `ModelRuntime` are unsupported in `0.2.0`; they fail preflight rather than using a private registry seam.

Malformed TypeBox arguments use Pi's standard schema-validation error. Semantic errors throw sanitized `[CODE] message` tool errors:

```ts
type PreflightErrorCode =
  | "CONFIG_INVALID"
  | "INPUT_INVALID"
  | "BATCH_SIZE_INVALID"
  | "GIT_UNAVAILABLE"
  | "GIT_REPOSITORY_UNAVAILABLE"
  | "MODEL_NOT_FOUND"
  | "MODEL_UNAVAILABLE"
  | "THINKING_UNSUPPORTED"
  | "REPORT_PATH_INVALID"
  | "REPORT_PATH_CONFLICT"
  | "PARENT_SESSION_EPHEMERAL"
  | "ENVELOPE_BUDGET_EXCEEDED"
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

| Resource | Base Task | With `git_diff` | With declared report |
|---|---|---|---|
| Built-in tools | `read`, `grep`, `find`, `ls` | same | same |
| Custom tools | none | `git_diff` | derived `write_report`, plus `git_diff` only when requested |
| Extensions | none | none | none |
| Skills, prompts, themes | none | none | none |
| Parent messages | none | none | none |
| Definition instructions | exact packaged role-neutral Subagent definition | same | same |
| Context files | filtered repository context | same | same |

The canonical effective-tool order is `read`, `grep`, `find`, `ls`, optional `git_diff`, then derived `write_report`. The actual list is fixed at admission and remains attached to success, failure, timeout, and cancellation outcomes whether or not a tool was called. `write_report` is never selectable, and requesting any custom tool without `reportPath` cannot grant it. Siblings resolve disjoint capability sets.

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
- subscribe before prompting and retain only invocation-bound run-start and completion evidence;
- always unsubscribe, abort if needed, dispose, and release references in `finally`.

A Concurrency slot is acquired before resource loading and held through child settlement and cleanup. Queued children hold no slot.

### 7.1 Exact role-neutral Subagent behavior

`agents/subagent.md` must normatively instruct the Subagent to:

1. complete only the bounded Task specification;
2. gather and evaluate evidence before concluding and unconditionally distinguish facts or findings, recommendations, and uncertainty;
3. use only supplied capabilities and never attempt nested delegation;
4. avoid intentional repository mutation except the exact declared report operation when `write_report` is present;
5. return a concise answer preserving the requested conclusion, evidence, and material caveats when no report is declared;
6. when a report is declared, complete exactly one successful `write_report` call with the complete Markdown evidence, retrying only a failed attempt, then return only a concise summary and declared path;
7. cite exact paths, symbols, and local sources when requested;
8. never claim access, execution, writes, or verification that did not occur;
9. stop when the requested answer is established instead of broadening scope.

It names no workflow role. Capability-specific policy belongs in tool descriptions. Tests compare the packaged file bytes with the approved fixture. A Significant behavioral change requires at least a minor pre-release increment and an explicit record of whether separate human-reviewed evaluation evidence was warranted and collected.

### 7.2 `git_diff` inspection contract

`git_diff` accepts a strict discriminated union:

```ts
type GitDiffInput =
  | { comparison: "working_tree"; path?: string }
  | { comparison: "since"; fixedPoint: string; path?: string };
```

`working_tree` compares `HEAD` with the current working tree and includes staged, unstaged, and non-ignored untracked evidence. With an unborn `HEAD`, it compares tracked state against Git's empty tree. `since` verifies `fixedPoint` as a commit, resolves `merge-base(fixedPoint, HEAD)`, compares that base with the current working tree, and includes a bounded commit summary for `fixedPoint..HEAD`. Detached `HEAD` is supported. Missing `HEAD` for `since`, an invalid fixed point, or incomplete history that prevents a merge base returns a bounded truthful tool error. If `HEAD` is the merge base because it is behind or equal to the fixed point, the comparison starts at `HEAD` and the commit summary is explicitly empty where appropriate.

Every no-path call renders a comparison header, resolved base, observed `HEAD`, and a changed-file manifest with deterministic canonical ordering and bounded status, numstat, rename, binary, and non-ignored untracked evidence. Untracked paths come from Git's tracked-file index query for other non-ignored files, not status. A clean result contains `No changes.`. A complete aggregate raw patch is appended only when it is at most 64 KiB UTF-8; otherwise it is omitted with an instruction to request individual paths.

An optional normalized project-relative `path` identifies a literal file or directory prefix, never pathspec syntax. It is canonical and repository-confined. For renames, selecting either endpoint includes both endpoints. A path call returns at most 64 KiB of the longest valid UTF-8 patch prefix and exact truncation metadata. Deleted, binary, truncated, or otherwise incomplete evidence stays visibly incomplete; current-file reads remain available but the tool never claims they recover missing patch evidence.

Manifest, commit-summary, and framing text has a separate 16 KiB compact UTF-8 ceiling. Overflow retains canonical order and reports omitted counts. Patch inclusion cannot displace protected metadata. Exact rendered model-visible `content` is at most 80 KiB UTF-8. `details` contains only bounded structured comparison metadata, counts, resolved commits, inclusion/truncation flags, and diagnostics; it does not duplicate manifest or patch text. Every call observes current repository state and reports its observed `HEAD`; the stateless tool promises no cross-call snapshot isolation.

Git is spawned directly with fixed package-owned argv and no shell. The API exposes no executable path, cwd, environment, Git configuration, arbitrary subcommand/option array, output path, or pathspec. Repository discovery uses the nearest canonical Git ancestor and supports ordinary checkouts and Git worktrees. Fixed points are byte-bounded, reject leading hyphens and control separators, and are resolved as commits after end-of-options. Paths reject traversal, control separators, leading-option ambiguity, symlink escape, and Git pathspec magic and are passed literally after `--`.

Every invocation uses repository-root cwd, a platform-aware minimal process environment, bounded timeout, and bounded stdout/stderr buffers. It scrubs ambient Git directory, work-tree, config, and external-diff variables; disables system/global configuration influence, pagers, color, external diff, text conversion, filesystem monitors, signature display, and optional locks; and pins stable `a/`/`b/` prefixes, three context lines, rename detection, and non-octal Unicode path rendering. It never adds `safe.directory` or bypasses dubious-ownership protection. Unsafe ownership fails closed with a bounded actionable error. Tests must verify the exact supported-platform invocations and that repository files, index identity, refs, status, and relevant metadata are not intentionally changed.

## 8. Scheduling and lifecycle

### 8.1 Deadlines and FIFO

- Maximum Flat batch: 8 children.
- Extension-wide Concurrency slots: default 4, configurable 1–4.
- One strict FIFO spans all Delegations in registration and input order.
- Queue deadline: from registration, default 5 minutes.
- Setup deadline: after slot acquisition through resource loading, session creation, prompt preprocessing, and the Child run-start boundary, default 30 seconds.
- Running deadline: from the Child run-start boundary through settlement, default 15 minutes.
- Cancellation settlement: one shared Delegation clock, default 30 seconds.
- Graceful shutdown: one global clock, default 30 seconds.

The **Child run-start boundary** is the first invocation-bound public `agent_start` event. Subscribe before invoking exactly one ordinary `session.prompt()` call, with child extensions and prompt/skill/template expansion disabled. That first event atomically ends Setup, starts the Running deadline, and moves the child to `running`; later `agent_start` events from retries or compaction continuations do not restart either deadline.

A `prompt()` throw, rejection, or resolution before that event produces setup-stage `PROMPT_REJECTED`. After the event, promise rejection or error settlement produces run-stage `RUN_FAILED`. Setup timeout or cancellation racing with the event obeys atomic first-transition-wins. No `PromptOptions.preflightResult` or other internal RPC hook is used.

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

Delegation `running` begins when any child crosses the Child run-start boundary and may coexist with queued/setup siblings. `finalizing` begins only when every child outcome is immutable and no Subagent remains live. Failed envelope construction or persistence self-loops in `finalizing`. `terminal` begins only after successful terminal-envelope append.

Child terminal transitions are atomic first-transition-wins. Run completion, timeout, and cancellation first produce competing **Settlement evidence**. The winning evidence is projected and classified as part of the first terminal transition; it is not itself a provisional Terminal outcome. If projection of winning run evidence fails, that first transition is directly to `failed` with `PROJECTION_FAILED`. Once selected, a Terminal outcome is never rewritten, and late evidence is rejected.

### 8.3 Truthful phases

Parent-visible Delegation phases are only `queued`, `running`, `cancelling`, `finalizing`, and `terminal`. Child inspection adds `setup`. The package exposes no percentage, ETA, inferred progress, silence-based stall, tool-count, transcript-derived activity, or completion order.

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

Record the message boundary before invoking the child prompt. After Settlement evidence wins, scan only later messages attributable to that invocation and select the final assistant message. Join nonempty text blocks in source order with `\n\n`, then trim outer Unicode whitespace.

| Winning evidence | First and only child Terminal outcome |
|---|---|
| `stopReason: "stop"` and nonempty projected text or valid report | `succeeded` |
| `length` | `failed`, `OUTPUT_LENGTH`, useful text as `partialResult` |
| `error` | `failed`, `RUN_FAILED`, useful text as `partialResult` |
| `aborted` after winning host cancellation | `cancelled`, no partial text |
| other `aborted` | `failed`, `RUN_FAILED` |
| `toolUse`, missing assistant message, or empty text | `failed`, `OUTPUT_MISSING` |
| missing/unsafe required report | `failed`, `REPORT_MISSING` or `REPORT_WRITE_FAILED` |
| projection exception or invalid conversion | `failed`, `PROJECTION_FAILED` |

Projection and classification occur within the atomic terminal transition. Settlement evidence is not a provisional outcome: a projection fault therefore selects `failed` once rather than rewriting an earlier `succeeded` outcome. A no-report success uses `result`; a report success uses the projected text as `report.summary` and the complete normalized declared path as `report.path`.

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
type TerminalEnvelopeV2 = {
  schemaVersion: 2;
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
  effectiveTools: Array<"read" | "grep" | "find" | "ls" | "git_diff" | "write_report">;
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

Exactly one of `result` or `report` exists on success. Neither exists on non-success. Task prompts, transcripts, usage, completion order, and internal absolute paths are excluded. `effectiveTools` is protected, non-truncatable authority metadata in canonical order. It must be unique, contain every base tool, and contain only legal combinations. A successful report outcome requires `write_report`; a successful direct-result outcome forbids it. Non-success outcomes may retain `write_report` because authority was granted before failure.

### 9.4 Size limits and canonical allocation

- Single successful text: 16 KiB UTF-8.
- Failed/timed-out `partialResult`: 4 KiB UTF-8.
- Error message: 512 UTF-8 bytes.
- Flat-batch variable-content pool: 24 KiB.
- Complete compact canonical envelope: 32 KiB.

Each child contributes at most one truncatable field: `result`, `report.summary`, or `partialResult`. Apply the 16 KiB result/summary cap or 4 KiB partial-result cap before batch allocation. A report path is protected content: retain its complete normalized UTF-8 value or reject the Delegation at preflight; never truncate it during projection.

Canonical allocation is input-order- and completion-order-independent:

1. For every integer byte waterline `w` from zero through 16 KiB, derive each truncatable field as its longest valid UTF-8 prefix no longer than `min(w, its individual cap)`. Preserve at least one complete code point for a required no-report success result.
2. Add the UTF-8 bytes of all complete report paths and retained fields. For every truncated field, add the UTF-8 bytes of its actual compact-JSON `truncation` object, including exact `originalBytes` and `retainedBytes` values. This is the 24 KiB variable-content cost.
3. Construct the complete compact canonical envelope for that waterline. Its actual UTF-8 serialization is the 32 KiB envelope cost.
4. Select the greatest common waterline satisfying both ceilings. Short fields consume only their actual bytes and thereby raise the common waterline available to longer fields. A field's retained prefix always ends at a valid UTF-8 boundary.
5. Leave capacity that cannot raise the common waterline unused. Never distribute remainder bytes by input index, completion order, or reverse order.

The feasibility proof in preflight guarantees a legal protected representation. If an invariant-breaking envelope-construction fault nevertheless occurs after all child Terminal outcomes are immutable, keep the Delegation in `finalizing`, expose `TERMINAL_PROJECTION_FAILED`, and retry only on `inspect` and graceful shutdown. Do not replace, reclassify, or otherwise rewrite any child outcome.

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
    | "TERMINAL_PROJECTION_FAILED"
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

1. construct the canonical envelope from immutable child Terminal outcomes using section 9.4;
2. append it synchronously with Pi's public API:

   ```ts
   pi.appendEntry("pi-subagents-minimal:terminal", terminalEnvelope);
   ```

3. only after successful append, transition `finalizing → terminal`;
4. activate `delegation_control` if needed;
5. unless shutdown is active, send one completion message.

Successful `appendEntry()` is the durability boundary; the package makes no fsync claim. If canonical construction throws or violates either size invariant, remain `finalizing`, send no completion, expose `TERMINAL_PROJECTION_FAILED`, and retry on inspect and graceful shutdown without rewriting child outcomes. If append throws, remain `finalizing`, send no completion, retain the immutable candidate envelope in memory, expose `TERMINAL_PERSIST_FAILED`, and retry on inspect and graceful shutdown.

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

On `session_start`, scan `ctx.sessionManager.getBranch()` in order. Validate custom type, schema, size, ids, digest, and marker ordering. Use separate exact validators for legacy Terminal envelope version 1 and current version 2. Version 1 has no `effectiveTools`; it is returned with its exact persisted compact bytes and is never backfilled, inferred, normalized, or rewritten. Version 2 requires canonical, unique, known, legal effective-tool combinations. Both versions may coexist on one active branch, and consumption markers continue to hash the exact persisted envelope bytes. Accepted Delegation, Live inspection, and consumption-marker schemas remain version 1 because their shapes do not change. Unknown future versions, malformed entries, or digest mismatches never mutate state and produce bounded `PERSISTED_ENTRY_UNREADABLE` diagnostics.

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
8. **Preflight rejection:** legacy `agent`, arbitrary/unknown tools and fields, unusable model/auth, unavailable Git or repository when requested, unsupported Thinking, oversized batch/text, duplicate/unsafe report path, infeasible protected envelope metadata, ephemeral parent, invalid config, and timeout return no id and start no child. Omitted/empty tools are equivalent and duplicate `git_diff` is idempotent.
9. **Terminal races:** result/cancel and result/timeout in both orders obey atomic first-transition-wins and reject late results.
10. **Graceful shutdown:** live and unread Delegations coexist; one global grace applies, live work is cancelled, persist-before-exit is attempted, and persisted unread envelopes survive reload.
11. **Notification failure:** persisted result remains terminal/unread and inspectable with `COMPLETION_NOTIFY_FAILED`.
12. **Capability isolation:** exact complete allowlist for every combination; no edit, write, Bash, PowerShell, delegation, arbitrary Agent/extension/skill loading, or accidental report writer; exact Unicode Task bytes; and sibling isolation.
13. **Projection bounds:** UTF-8 boundary cases; an independent common-waterline reference model; permutation invariance across input and completion order; complete report-path and effective-tool reservation; maximal eight-child metadata; indivisible-remainder non-allocation; 16/4/24/32 KiB boundaries; projection-fault finalizing/retry behavior; immutable child classifications; sanitized errors; and no content duplication.
14. **Branch semantics:** mixed exact v1/v2 active-branch envelopes and markers reconstruct byte-identically; unknown versions and digest mismatches fail explicitly.
15. **Git semantics:** real temporary repositories and worktrees cover working-tree and fixed-point committed/staged/unstaged/untracked changes, divergence and merge-base, empty/unborn/detached/incomplete-history cases, summaries, rename endpoints, deletion, binary, executable bit, Unicode paths, directories, and clean output.
16. **Git bounds:** independently check exact 16/64/80 KiB rendered UTF-8 boundaries, valid prefixes, aggregate omission, per-path truncation, canonical ordering, omitted counts, metadata protection, timeout, and stdout/stderr overflow.
17. **Git process safety:** observable canaries prove pagers, aliases, hooks, signatures, filesystem monitors, external diffs, text converters, hostile config/environment, option-like refs, pathspec magic, traversal, symlink escape, and optional locks cannot execute or broaden access; compare repository files, index, refs, status, and metadata before and after on macOS, Linux, and Windows.
18. **Prompt and package:** approved generic definition bytes appear exactly once in the packed artifact, the retired definition is absent, descriptions accurately state comparison/incompleteness semantics, and parent diff/simplification skills request only `git_diff` with matching comparisons.

### 14.2 Model evaluation policy

Mechanical CI and release gates qualify the deterministic lifecycle, isolation, Git safety/semantics, projection, persistence, context-budget, packaging, and compatibility obligations in this contract. They make no certified output-quality claim for any provider, model, Thinking level, prompt, or trial matrix. Issue #9's historical Behavioral battery is superseded and must not be restored as a release gate.

A Significant behavioral change records whether separately designed evaluation evidence is warranted. A Recorded evaluation may be retained for human review when a deliberate one-off assessment of observable model behavior answers a concrete question. A smaller Quality smoke may instead provide directional confidence. Both are optional supporting evidence, designed for the change at hand under ADR 0001, and neither certifies or blocks a release. No provider-backed run is required merely because `0.2.0` is a Significant behavioral change.

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

## 15. Change-to-evidence map

| Contract assertion | Originating decision | Required evidence |
|---|---|---|
| Public `createAgentSession`, fresh in-memory child, public ModelRuntime, invocation-boundary projection, abort/dispose | [Determine the minimum correct Pi child-session runtime](https://github.com/Blaise-g/pi-subagents-minimal/issues/4) | child integration, isolation, stop-reason, cancellation, cleanup tests |
| Public invocation-bound `agent_start` Child run-start boundary with promise-based rejection classification | [Identify a public Pi prompt-acceptance boundary](https://github.com/Blaise-g/pi-subagents-minimal/issues/15) | event/promise race, pre-start resolution/rejection, retry/compaction, and timeout/cancellation tests |
| One role-neutral Subagent definition, parent-owned Task roles, no Agent catalog | [Generalize Subagent Tasks and add bounded Git diff inspection](https://github.com/Blaise-g/pi-subagents-minimal/issues/40) | packaged-byte, exact-prompt, packed-artifact, and capability-isolation tests |
| One permanent launch tool, dynamic inspect/cancel, persist-first inbox, steering notification | [Define the minimal background lifecycle contract](https://github.com/Blaise-g/pi-subagents-minimal/issues/6) | dynamic-tool, recovery, notification ordering/failure tests |
| 8-child/4-slot FIFO, deadlines, all-settled ordering, outcome precedence, cancellation races, shutdown | [Define concurrency, cancellation, and failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/7) | controlled-clock/state-machine/reference-scheduler tests with red proof |
| Explicit partial/timeout outcomes, finalizing, visible partial result, separate Host diagnostics | [Compare v1 and Arhen failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/12) | exact envelope and persistence/cleanup fault tests |
| 4/2/6 KiB tool budgets, 1,500-token/prompt bounds, 16/4/24/32 KiB envelope bounds, drift policy | [Set the v1 context budget](https://github.com/Blaise-g/pi-subagents-minimal/issues/8) | payload snapshots, provider token protocol, UTF-8 boundary/property tests, independent water-fill model |
| Protected report paths, common-waterline allocation, preflight feasibility, and projection without Terminal-outcome rewrites | [Correct canonical contract acceptance, allocation, and projection semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/16) | permutation/property tests, protected-metadata rejection, envelope-fault finalizing/retry, and immutable-outcome tests |
| Base local inspection, selected bounded `git_diff`, closure-bound Markdown report, preflight completeness, `triggerTurn: true` | [Generalize Subagent Tasks and add bounded Git diff inspection](https://github.com/Blaise-g/pi-subagents-minimal/issues/40) | forbidden-capability, Git semantic/security/boundary, unsafe report path, preflight no-id/no-start, idle/active notification tests |
| Closed additions-only Task tools, canonical effective tools, v2 envelopes, exact legacy v1 persistence | [Generalize Subagent Tasks and add bounded Git diff inspection](https://github.com/Blaise-g/pi-subagents-minimal/issues/40) | public-schema, projection/allocation, mixed-version recovery, marker, and feasibility tests |
| Exact npm artifact, Pi/Node/Bun boundary, platform matrix, upgrade/release policy | [Set the v1 packaging and compatibility boundary](https://github.com/Blaise-g/pi-subagents-minimal/issues/11) | packed-install/platform/version/tarball/provenance gates |
| Exact schemas, config, entries, envelopes, codes, paths, transitions, and evidence map | [Freeze the canonical v1 implementation contract](https://github.com/Blaise-g/pi-subagents-minimal/issues/13) | schema snapshots plus an assertion-to-test inventory covering every section above |

Tests follow anchor-before-assertion: this contract and its named source decisions are the external anchors. Lifecycle, serialization, security, path, compatibility, and packaging claims remain deterministic. Optional model evaluation is supporting human-reviewed evidence outside mechanical qualification. Every new deterministic behavior requires a defect-revealing red proof before green verification; implementation branches without a contract anchor are not allowed to define expected behavior.
