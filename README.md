# Minimal Subagents for Pi

A deliberately narrow Pi extension for isolated, bounded repository analysis. It runs one role-neutral Subagent or a flat batch with explicit, least-authority tools and an optional closure-bound Markdown report.

## Status and canonical contract

The installed `0.2.0` code is for local dogfooding against the approved [implementation contract](docs/spec/v1-implementation-contract.md). The retained [proposal](docs/spec/v0.2-generic-subagent-capabilities-proposal.md) and [independent review](docs/spec/v0.2-generic-subagent-capabilities-review.md) are historical design evidence, not normative requirements.

## Development install

From this checkout, install by absolute path:

```sh
pi install /absolute/path/to/pi-subagents-minimal
```

Pi references a local package in place, so source changes are available in the next Pi session without publication. Use `-l` to record the package in project settings instead of user settings.

Supported hosts are stable Pi `>=0.84.3 <0.85.0` and Node `>=22.19.0`.

## Upcoming `0.2.0` surface

`delegate` starts one bounded Subagent or a flat batch in the background. Pi receives a concise completion notification and can use `delegation_control` to inspect the durable result or cancel live work.

A Task contains an opaque bounded `task` string and optional `tools`, `model`, `thinking`, and `reportPath`. Parent skills may state a temporary role or analytical lens in `task`; this selects no definition and grants no capability. Every Subagent receives `read`, `grep`, `find`, and `ls`. The only selectable additional `0.2.0` tool is `git_diff`, a bounded interface for working-tree or fixed-point change inspection—not Bash or general Git. A valid `reportPath` derives `write_report` for exactly one project-relative Markdown path beneath `artifacts/`.

Examples of parent requests:

- **Repository exploration:** “Delegate a Subagent to locate where configuration precedence is implemented. Return exact paths and symbols and explain the precedence concisely.”
- **Evidence-intensive local research:** “Delegate a Subagent to establish the repository's session-isolation behavior from local sources and write the evidence to `artifacts/session-isolation.md`.”
- **Two-axis diff review:** “Review the changes since `<fixed-point>` using `code-review-diff`.”
- **Three-lens simplification:** “Review the current changes using `code-simplify`.”

The `research`, `code-review-diff`, and `code-simplify` skills are external parent workflows and are not bundled. They own task framing and result consumption. Bash, PowerShell, tests/checks, generic Git, arbitrary tool forwarding, and external web access are deferred from `0.2.0`.

Deterministic qualification covers extension behavior and compatibility. Optional Recorded evaluations or Quality smokes answer concrete model-behavior questions; they are not CI, release gates, or a Behavioral battery.

## Public release

The planned stable install remains:

```sh
pi install npm:pi-subagents-minimal@1.0.0
```

Stable publication follows the [maintainer release instructions](docs/releasing.md) after the exact tagged candidate passes the complete release contract.
