# ADR 0003: Replace the local runtime with a task-first extension

Status: Accepted; amended 2026-10-14 to select badlogic's extension; supersedes [ADR 0002](0002-use-one-subagent-profile-and-closed-additional-tools.md)

## Context

The maintained use cases are research and report-only code review. Their workflow instructions already live in external skills used across Pi, Claude Code, and Codex. Maintaining another copy of those roles, plus a custom child runtime, persistence protocol, bounded writer, and release surface in this repository costs more than these use cases justify.

The initial replacement was `@nijaru/pi-subagents@0.0.3`. On 2026-10-14, the user selected [badlogic's extension](https://github.com/earendil-works/pi-subagent) for its inspectable tmux sessions, retained conversations, steering, and follow-ups. The [comparison](../research/subagent-review-research-comparison.md) records the trade-offs: model diversity was already available, while this switch adds persistent conversations and requires explicit result collection rather than automatic completion wake-ups. The skill still supplies the complete task; no named Agent definitions are required.

## Decision

Use `@earendil-works/pi-subagent` from `https://github.com/earendil-works/pi-subagent`, pinned to commit `4fc1fe5178d1a2b474794a5ee39e7295844e9d3c`, for Pi delegation. Keep `pi-subagents-minimal` retired as an active runtime.

- The external skills own research and review instructions, model choices, capability requests, scope, and completion criteria.
- This repository does not duplicate or adapt those skill instructions.
- Pi resolves requested capabilities to its native tool names when invoking the extension.
- Claude Code and Codex use their own native delegation and editing tools; this Pi extension does not provide a cross-runtime adapter.
- No named Agent definitions are added.
- The upstream checkout remains pinned to an inspected commit; its manifest is private and does not establish an npm release.
- Use the upstream `subagent` CLI and bundled `subagent` skill for lifecycle operations. Install tmux as a prerequisite; collect results explicitly with `subagent wait`.
- Select tools explicitly for report-only tasks. Research keeps its configured web integrations; reviews need no mutation tools. Tool selection is not a sandbox.
- Preserve required reports before `subagent stop`, which deletes the retained conversation and metadata.

## Consequences

The TypeScript implementation, tests, specifications, and release evidence in this repository become historical material. New executable work requires a new accepted decision that explicitly reactivates the local runtime. Routine maintenance is limited to recording replacement evidence or correcting historical documentation.

Upstream upgrades are deliberate commit changes followed by a focused compatibility check. The replacement does not preserve this package's persistence envelopes, bounded report writer, or closed capability contract; those features are no longer product requirements. Conversations persist across reloads; quitting or replacing the parent session suspends them, and resuming that parent relaunches them idle with history. This is not unattended execution after parent shutdown.
