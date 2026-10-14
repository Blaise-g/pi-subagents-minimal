# Subagent comparison for research and independent code review

## Recommendation at comparison time

**Subsequent decision:** the user chose badlogic's extension on 2026-10-14. [ADR 0003](../adr/0003-replace-local-runtime-with-task-first-extension.md) now records the adopted executor and accepted trade-offs; the comparison below preserves the original recommendation and pre-migration observations.

**Original recommendation: retain `@nijaru/pi-subagents@0.0.3` for the maintained use cases.** It already supports fresh-context, per-call multi-model delegation without named Agent definitions. `badlogic/pi-subagent` is the closer alternative if durable conversations, steering, and direct child-TUI access become requirements. `pi-subagent-manager` provides substantially more orchestration and UI, but its required agent types and role-level model selection do not match this repository's task-first decision. None of these observations justifies reactivating the retired local runtime. [ADR 0003](../adr/0003-replace-local-runtime-with-task-first-extension.md)

This is a source-based comparison, not a model-quality or runtime benchmark. **Verified** below means observed in the cited README, implementation, package metadata, or local artifact comparison. Recommendations and remaining uncertainties are identified separately. Research date: **2026-10-14**. No configuration changes, package installation, executable edits, credential reads, or live model calls were made.

## Sources and version provenance

| Candidate | Inspected revision/artifact | Compatibility evidence |
| --- | --- | --- |
| Installed baseline | Local `/Users/lorenzogermini/.pi/agent/npm/node_modules/@nijaru/pi-subagents`, version **0.0.3**. Public npm metadata associates it with commit `9b770d233914a97d1c9baed306f4fba6d965cdc5`. Downloaded published tarball and compared the complete extracted package against the installed directory: `diff -qr` reported no differences. All 14 installed files also matched that commit's contents. | Node **22.19+**; wildcard Pi peer ranges, but development dependencies and README checks target **Pi 0.87.0**. Wildcard peers do not establish compatibility with every later Pi release. [N1][N2] |
| `badlogic/pi-subagent` | Git HEAD **`4fc1fe5178d1a2b474794a5ee39e7295844e9d3c`**, dated 2026-09-30. README installation URL and manifest use **`earendil-works/pi-subagent`**; the user-supplied badlogic URL was cloneable. Manifest: **`@earendil-works/pi-subagent` 0.1.0**, **`private: true`**. Do not treat that as evidence of an npm release. | README requires Pi, **Node 22.19+**, and **tmux**. Wildcard Pi peers; no minimum Pi version or tested compatibility matrix in the inspected manifest. Source relies on APIs such as `resources_discover`, `agent_settled`, and shutdown reasons. [B1][B2][B4] |
| `championswimmer/pi-subagent-manager` | Git HEAD **`25783afbd9c5c0960a2e6d325c3354d564dfa680`**, dated 2026-10-14; manifest **0.29.2**. Tag `v0.29.2` resolves to `e60513112a9cf546dde8f2398654afcaacfbc810`; HEAD differs from that tag only in `CHANGELOG.md`. | README and peer dependency require **Pi 0.99.2+**; Node **22.19+**; dev coding-agent dependency pinned to **0.99.2**. At lookup, public npm `latest` was **0.29.1**, gitHead `75b97d96587f34326bf6fa60b01cb02a7e7ad3b5`; the version-specific **0.29.2** registry URL returned **404**. HEAD differs from that published revision only in package version/lock metadata and changelog, not runtime source. Git version/tag is not proof of npm availability. [M1][M2][M12] |

The locally readable host Pi manifest and `pi --version` report **1.2.0**. Global settings explicitly select `npm:@nijaru/pi-subagents@0.0.3`. `command -v tmux` found no executable on the current PATH, and `tmux -V` failed with command not found; badlogic therefore has an unmet local prerequisite. These checks do not establish that either alternative works against this host. Current host documentation was read to interpret session, tool-exposure, and extension APIs; candidate behavior is grounded in each candidate's pinned source, not inferred from current Pi documentation.

## Comparison at a glance

| Concern | Installed baseline | badlogic | Manager |
| --- | --- | --- | --- |
| Task identity | Prompt plus generated handle; no role files | Prompt plus handle; optional display name, not a role definition | Required `type` plus thread path; six bundled types |
| Multi-model control | `model: "provider/model-id"` **per call** | `--provider`, `--model`, `--thinking` **per spawn** | Type preferences/current-model policy; **no model field in `agent_spawn`** |
| Independent context | Always fresh conversation | Fresh initial JSONL conversation | Independent top-level path/fresh command; `/root/...` instead inherits root history |
| Parallel admission | **4** active; **32** retained handles | No package-level concurrency cap found | Default **16** active, **64** retained, **3** levels; configurable |
| Async handback | Completion message requests parent follow-up turn | Status widget plus explicit CLI `wait`; no automatic result/wake notification found | Detached settlement wakes parent; optional batched Final Recap |
| Persistence/followups | No persisted child session or steer API | Durable JSONL/inbox; steer/follow-up; idle child TUI | Durable sessions/registry/mailbox; steer, pause, resume, live viewer |
| Research integrations | Child independently loads configured integrations | Child independently loads configured integrations unless disabled | Default bridges permitted external tools through root context; optional child extension reload |
| Fit under ADR 0003 | Direct fit | Task-first fit; added tmux/persistence operations | Type-based design conflicts with no named Agent definitions |

Evidence for the table is detailed below. None installs a fixed four-reviewer panel or guarantees independent conclusions simply by launching four children.

## 1. Installed baseline: what it already provides

### Models, context, and concurrency — verified

The tool schema accepts optional `model` on `run`/`spawn`. The implementation otherwise uses `ctx.model.provider/id` and passes the parent's thinking level to the subprocess. Four separate calls can therefore deliberately select four different configured models. The **4-active-child cap** happens to allow a four-reviewer fan-out; it is not a built-in four-reviewer workflow. Admission rejects excess starts rather than queuing them. Completed handles are evicted first once retention reaches **32**. [N3][N4][N5]

Every child is launched with `pi --mode json -p --no-session`; prompt content travels over stdin. Parent conversation history is not copied. Child Pi still discovers its own configuration, extensions, skills, and applicable repository instructions. Fresh conversation is not an empty system prompt or identical configuration to the parent. No named Agent definitions or recursive children are supported. [N1][N3][N6]

### Tool restriction and research access — verified

Defaults select active parent tools from the fixed coding/research list: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, `web_search`, `web_fetch`, `web_research`, `resolve-library-id`, and `query-docs`. Explicit `tools` must name active parent tools; `[]` is allowed and launches with `--no-tools`. The child's separate process must also have the integrations configured: parent-only runtime tools/providers/permission state are not cloned. The package supplies no research service itself. Other exact active names can be explicitly requested, even when absent from the default list. The locally installed web extension exposes `fetch_content`, not `web_fetch`, so research needing Fetch must request `fetch_content` explicitly rather than rely on this default list. Its deferred `continue_extraction` capability also needs a focused compatibility check if truncated pages matter. [N1][N4][N6]

For report-only review, omit mutating tools and do not confuse `bash` with read-only access. An allowlist constrains model tools, not loaded extension hooks or OS permissions. Shell retrieval may be useful for research, but it permits writes; an instruction not to edit is not a sandbox. [N1][N4]

### Results and lifecycle — verified

`run` joins for **60 seconds** by default, then leaves the same child running in the background; do not launch a duplicate when that budget expires. Background completion sends a visible message with `triggerTurn: true`, delivered as a follow-up. Blocking joins suppress completion notices when they deliver the result, although an already queued notice can still arrive. `wait` cancels only its wait; cancelling `run` cancels its child. [N1][N3]

Terminal assistant output is retained with a **50 KiB** bound; tool response/details are also bounded. The completion excerpt is **8 KiB**, with guidance to call `wait` for the retained result when truncated. **“Full retained result” does not recover text already discarded by the 50 KiB output bound.** The runner extracts terminal assistant text rather than retaining the whole conversation. Child execution defaults to **30 minutes**, configurable up to **2 hours**; wait defaults to **30 seconds**, maximum **120 seconds**. [N5][N6][N7]

Handles are session-local. Quit, reload, or session replacement closes children; no resume/steer/persisted conversation is provided. Process-group cleanup and a parent-death watchdog support cancellation, with weaker Windows guarantees described in the README. Separate processes still share the working tree; neither read consistency nor write ownership is enforced. [N1][N3]

## 2. badlogic: task-first, observable, persistent children

### Actual per-call models and names — verified

The CLI reads `PI_PROVIDER`, `PI_MODEL`, and `PI_REASONING_LEVEL` from the spawning shell environment; thinking falls back to `medium`. Each spawn can override these through **separate** `--provider`, `--model`, and `--thinking` arguments. Provider/model are required if not supplied by environment. `--name` is an optional **1–64-character display label**, not a discovered role or model alias. Generated handles remain management identifiers. The package has no Astra/Sol/Fable/Opus definitions. [B1][B3]

`--cwd`, repeated `--prompt`, and repeated `--file` arguments supply the child workspace and initial task/files. The launch creates a dedicated JSONL session and interactive Pi process in a detached tmux session. It does not copy parent conversation history. [B3][B5]

### Async notifications and concurrency — verified from source

The CLI spawn returns immediately. Parent extension code polls metadata every **1 second** for a widget showing up to **5** active names/states, with overflow count; `/subagent` attaches or switches to a child's tmux TUI. The control inbox is polled in the child every **250 ms**. [B4]

**No automatic parent completion message or model-turn wake was found.** `index.ts` sends user messages into the child when processing its inbox, but has no parent `pi.sendMessage` completion path. The parent must explicitly obtain results with `subagent wait` (normally through bash) or inspect the child. This materially differs from both baseline and manager background handback. [B3][B4]

No package-level active-child limit, retained-run limit, task execution deadline, or queue admission scheduler was found in the complete CLI/extension/shared implementation. Four independent launches are possible in design, but service rate limits, tmux availability, and actual parallel model requests were not tested. `wait` has a **1800-second default polling deadline**, optional positive-integer seconds; expiration fails the wait, not a child execution deadline. [B3][B4][B5]

### Tools and research — verified, with host-dependent limits

`--tools` forwards a comma-separated allowlist to child Pi, not a snapshot of parent tool implementations. Empty selections are rejected; there is no equivalent explicit zero-tool flag exposed by this CLI. The bundled skill documents `read,grep,find,ls` for repository-only investigation and warns that `bash` can modify files. Without an explicit selection, this implementation delegates defaults to the installed Pi; the skill's claim of four default coding tools should not override newer host configuration. [B3][B6]

Normal child extension discovery can provide configured research tools. There is no parent runtime-tool bridge or package-provided web research backend. `--no-extensions` disables normal discovery **while explicitly retaining the control extension**; it may therefore remove the research integrations needed for the task. Separate flags disable skills, prompt templates, or context files. Do not disable repository instructions merely to claim independent review: independence from parent conclusions and compliance with repository rules are different concerns. [B1][B3][B5][B6]

Tool availability and credential/provider compatibility remain child-Pi configuration concerns. tmux is an additional environment boundary; the code passes the run directory and explicit model launch arguments, not a curated clone of root runtime state. No sandbox or permission-hook equivalence was verified. [B5]

### Results, steering, and session lifecycle — verified

`wait` checks durable metadata, requires that work has started, waits for idle with no pending inbox files, then reads the latest assistant message **on the active JSONL branch**. It emits text blocks and distinguishes error/aborted stop reasons via nonzero exit status. It does not print the whole transcript. No package-level final-output truncation was found: the transcript remains on disk, although the parent's bash result and Pi/model context can impose their own limits. Repeated waits/followups are reads of current session state, not immutable per-turn job results. [B3][B5]

`send` prompts an idle child or steers a busy child; `send --follow-up` queues input after busy work. Inbox writes use temporary-file rename. Children remain idle for further input after completion. Reload leaves them alive; parent quit or session replacement suspends running children while retaining transcript/metadata. Resuming that parent session relaunches them **idle with history**, not automatically continuing the interrupted task. `stop` kills tmux and **deletes transcript and metadata**. Preserve any required report before stopping. The managed nested-spawn command rejects children. [B1][B3][B4][B6]

Run metadata lives under `<Pi agent dir>/subagents/<handle>`, normally `~/.pi/agent/subagents`. Parent UI lists are scoped by parent session ID. CLI lookup uses a global handle directory; its `list` filters by `PI_SESSION_ID` when present and otherwise lists all runs. This is management scoping, not authorization isolation. The launcher also prefers an executable `pi-test.sh` in the child cwd over `pi`; review that workspace file before relying on the launch identity. [B3][B5]

## 3. Manager: typed, hierarchical sessions with persistent UI

### Models and independent review scope — verified

`agent_spawn` accepts `{path,type,task,wait?,timeoutMs?}`: **no per-call model/tools/cwd override**. Models are selected from type-level `models` (legacy `model` is also parsed), parent/current settings, and the `modelSelection` policy. Default **`pick-first-scoped`** chooses the first preferred model also available in root scope. No matching preferred model fails clearly. With no model preferences, the parent's model is inherited; **`use-current`** uses the root's current model even for nested children. `modelSuggestions` are advisory only. The driver rejects unreproducible `pi-virtual` models and clamps thinking to model support. [M3][M4][M5]

Bundled types are `architect`, `coder`, `researcher`, `reviewer`, `tasker`, and `writer`. The inspected researcher/reviewer files have suggestions, not active model pins. Launching four `reviewer` instances does **not** automatically diversify models. A single type's ordered fallback list selects one model, not one model per sibling. Deterministic four-model review would normally require distinct configured types, conflicting with this repository's no-named-Agent-definition policy. [M1][M4][M10]

Context is path-dependent: `/root/task` snapshots the root conversation; `/task` is an independent root with no inherited conversation. Nested threads snapshot their **lexical parent**, not necessarily the caller. `/agents fork:<type>` creates the former, `/agents fresh:<type>` the latter. Fork snapshots filter unmatched tool exchanges and omit the parent's system prompt, but still carry conversation conclusions and custom/shell messages. Use fresh paths for genuinely independent opinions; still provide scope and repository rules explicitly. [M5][M6][M7]

### Concurrency, notifications, and stopping — verified

Defaults are **16 starting/running threads**, **64 retained threads**, **3 levels** including root. Waiting parents count as active. Full admission fails rather than queuing. Launch independent siblings with `wait:false` before waiting; default foreground waits otherwise serialize parent launches. Non-root callers can manage descendants and spawn immediate children; root can inspect all trees, including independent roots. [M3][M5][M6]

Detached completion/failure/stop sends a result event and requests a parent wake; progress updates do not start a turn. Root notifications are persisted and delivered into model context without displacing the root's visible answer. Opt-in **Final Recap** coalesces completions until **all outstanding detached threads**, including nested descendants, have settled. Reporting timeouts still request a wake. Nested results belong to the lexical parent and are not automatically copied into the root mailbox. Mode `off` suppresses delivery and automatic turns. [M6][M7][M8]

Spawn/steer `timeoutMs` is a **report-only timer**, **30–300 seconds**, not a kill deadline. `agent_wait` supports a wait budget up to **1 hour**; cancellation does not stop the child. `agent_stop` cooperatively cancels a subtree and retains sessions; it is **not guaranteed external process termination**. No default package-level hard execution deadline was found in the manager/driver path. [M5][M6][M9]

### Tool restrictions and research inheritance — verified

Default `toolFiltering: "allowed"` grants only a type's exact `tools.allow` minus `tools.block`; absent/empty allow grants no tools. Alternatives expose all except blocked, or all. Source both selects registrations and installs a blocking `tool_call` hook. Built-in tools and manager controls are child-local. [M3][M4][M5]

External permitted tools normally execute through the **root's hook-preserving `executeTool` bridge**, retaining active/deferred exposure metadata. Child-local codemode/tool-search sees the child's permitted inventory, not the unrestricted root loadout. Other model-only tools fail closed because the bridge cannot preserve their execution contract. After reopening, UI-only resumes may need a root `agent_*` call to establish the bridge. A bridged external tool can mutate **root** session resources: conversation independence is not independent research infrastructure. [M5][M11]

Bundled researcher and reviewer allow `read,bash,grep,find,ls,agent_update,agent_pause`; they do **not** automatically allow every available web/MCP tool. Shell retrieval can work, but is not a read-only capability. Parent web tools require a suitable type allowlist or broader filtering policy. The roles' read-only prose is useful intent, not OS enforcement. [M10]

By default, SDK children load **no skills, prompt templates, context files, or normal extensions**; instructions come from the type and task. This means repository `AGENTS.md` is not automatically inherited as system guidance. Experimental `subagentExtensions` reloads configured files into child-local runtimes (excluding this manager), with trusted-project gating and no missing-package installation. It is not exact parent extension inheritance; remaining bridges use root context. Durable steering/replay bypasses `input` hooks, and shared side effects or interactive-extension failures remain possible. [M5][M13]

### Results, persistence, followups, and UI — verified

Final output is the last new assistant text after the session settles. Tool results/status and root completion notifications expose at most **16,000 characters**, marking truncation; `agent_output` pages retained full output (default **8,000**, max **16,000** characters per page). Activity text is separately capped at **1,000 characters** and timeout recent-output excerpts at **2,000**; these are not complete reviews. Native child tool/model context limits still apply. [M5][M6][M7][M9]

Child JSONL files are stored in the root session directory with ownership metadata. The registry records definitions, outputs, settings/metrics and active leaves in root custom entries; root mailbox IDs track delivery and recap consumption. Restore converts active saved threads to **paused**, requiring input to resume. Switch/tree/fork operations stop old working threads; forked root IDs do not inherit writable child registries. This is durable context, not a background worker that continues after host exit. [M5][M7][M9]

`agent_steer` queues steering for running agents or resumes completed/stopped/paused agents in the **same conversation**. Durable mailbox records support accepted steering and update recovery. No separate model-facing follow-up verb is exposed in the inspected tool schema; this is not interchangeable with badlogic's explicit `send --follow-up`. [M5][M6]

The `/agents` UI includes settings/types/import, tree navigation, live transcripts with thinking and tool results, steering, stop, and output inspection. Watching alone does not start work or attach to a separate interactive child TUI. Reap frees eligible retained-thread slots **without deleting session files**. Settings layer defaults → global → trusted project; types layer bundled → user → trusted project definitions/overrides under manager-owned directories. This is a larger lifecycle/configuration surface than either task-first package. [M3][M4][M7][M14]

## Screenshot interpretation and recommendation boundaries

**User-provided screenshot, inspected by the parent:** Mario's post says this is how he uses subagents “99.99% of the time.” It shows reviewers named Astra, Sol, Fable, and Opus checking `changes.md` claims, missed callsites, contradictions, and infeasible designs. Launch commands and model configuration are not shown. Names do not prove provider/model identity, fixed built-in reviewers, automatic four-way fan-out, or a special review engine. badlogic supports arbitrary display names; manager's shipped types are the six listed above; baseline has no roles. [B3][M1][N4]

**Recommendation for this repository:** keep research/review procedure and model choice in the existing external skills. For independent multi-model review, use separate fresh calls with explicitly selected provider/model IDs and a common immutable revision/evidence set. Treat `changes.md` as claims to check against code, not trusted conclusions. Have the parent integrate reports; no child needs edit/write privileges to provide findings. This describes the execution properties to preserve, not new workflow instructions or Agent definitions.

**When a change could be justified:** prefer badlogic if retained review conversations, explicit follow-up queuing, and child-TUI attachment outweigh tmux dependency and manual result collection. Evaluate manager only if the project deliberately accepts typed roles, hierarchical orchestration, persistent branch-aware UI, and root-tool bridges. Neither is needed merely to select four models. Any upgrade should pin an actual available artifact/revision and check foreground/background delivery, requested model identity, effective tool inventory, and shutdown behavior on the intended host version.

**Unverified limits:** no latency, cost, model accuracy, provider quota, live research-tool connectivity, tmux environment propagation, full permission-hook equivalence, Windows behavior, crash recovery, or host-Pi-1.2.0 compatibility was tested. No candidate tests were run. Persistence and safety claims here are code/documentation findings, not operational certification. Native tool truncation, compaction, model context windows, and changing files can still omit evidence; children sharing a changing worktree do not read a consistent snapshot. A tool allowlist is not a sandbox.

## Documentation checks

Verified all 32 commit-pinned source targets against the fetched Git objects, the local ADR link, and citation-label completeness. Checked the tarball SHA-1 against registry metadata. The parent checked the critical model-selection and notification claims against the cloned sources, inspected the screenshot, and added local host/prerequisite findings. Only this report was added; existing untracked files were left untouched. No synthetic tests were needed for this documentation-only research.

## Pinned primary references

All source links below are commit-pinned. npm registry observations are mutable public registry responses recorded on the research date.

### Baseline

- [N1] [README](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/README.md).
- [N2] [Manifest](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/package.json); [npm 0.0.3 metadata](https://registry.npmjs.org/@nijaru%2fpi-subagents/0.0.3); [published tarball](https://registry.npmjs.org/@nijaru/pi-subagents/-/pi-subagents-0.0.3.tgz) (registry SHA-1 `cc72c06d60673ef86ac8953486c3c4f65a5f8ea9`).
- [N3] [Tool, completion callback, lifecycle](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/index.ts#L34-L115).
- [N4] [Schema and tool selection](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/params.ts).
- [N5] [Resource limits](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/limits.ts); [session admission/retention](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/children.ts).
- [N6] [Subprocess supervisor and CLI arguments](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/supervisor.ts#L57-L99).
- [N7] [Terminal assistant extraction](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/subprocess.ts#L294-L327); [bounds implementation](https://github.com/nijaru/pi-subagents/blob/9b770d233914a97d1c9baed306f4fba6d965cdc5/extensions/pi-subagents/bounds.ts).

### badlogic

- [B1] [README](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/README.md).
- [B2] [Manifest](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/package.json).
- [B3] [CLI: spawn, tools, send, wait, stop](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/subagent.ts).
- [B4] [Extension: widget, attach, inbox, suspend/resume](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/index.ts).
- [B5] [Storage, tmux launcher, active-branch result reading](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/shared.ts).
- [B6] [Bundled operational skill](https://github.com/badlogic/pi-subagent/blob/4fc1fe5178d1a2b474794a5ee39e7295844e9d3c/skills/subagent/SKILL.md).

### Manager

- [M1] [README](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/README.md).
- [M2] [Manifest](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/package.json).
- [M3] [Settings documentation](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/docs/settings.md); [settings implementation](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/prefs/settings.ts).
- [M4] [Type loading, layers, exact tool policy](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/prefs/config.ts); [model preferences](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/prefs/models.ts).
- [M5] [SDK driver: model resolution, resources/tools, mailbox, output](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/orch/runtime.ts).
- [M6] [Model-facing tool schemas and output pagination](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/orch/tools.ts).
- [M7] [Root notifications, registry, lifecycle, fresh/fork commands](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/index.ts#L273-L765); [context snapshot filtering](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/orch/paths.ts).
- [M8] [Async lifecycle documentation](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/docs/async-lifecycle.md).
- [M9] [Thread manager: restore, admission, stop, final-output retention](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/orch/manager.ts).
- [M10] [Researcher definition](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/agents/researcher.md); [reviewer definition](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/agents/reviewer.md).
- [M11] [Root execution bridge](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/src/orch/inherited-tools.ts).
- [M12] [npm latest metadata](https://registry.npmjs.org/pi-subagent-manager/latest); [npm 0.29.1 metadata](https://registry.npmjs.org/pi-subagent-manager/0.29.1); [v0.29.2 tag](https://github.com/championswimmer/pi-subagent-manager/tree/v0.29.2); [published revision to inspected HEAD comparison](https://github.com/championswimmer/pi-subagent-manager/compare/75b97d96587f34326bf6fa60b01cb02a7e7ad3b5...25783afbd9c5c0960a2e6d325c3354d564dfa680).
- [M13] [Extension limitations](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/docs/subagent-extension-limitations.md).
- [M14] [Tools and UI documentation](https://github.com/championswimmer/pi-subagent-manager/blob/25783afbd9c5c0960a2e6d325c3354d564dfa680/docs/tools-and-ui.md).
