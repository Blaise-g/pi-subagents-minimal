# ADR 0003: Replace the local runtime with a task-first extension

Status: Accepted; supersedes [ADR 0002](0002-use-one-subagent-profile-and-closed-additional-tools.md)

## Context

The maintained use cases are research and report-only code review. Their workflow instructions already live in external skills used across Pi, Claude Code, and Codex. Maintaining another copy of those roles, plus a custom child runtime, persistence protocol, bounded writer, and release surface in this repository costs more than these use cases justify.

`@nijaru/pi-subagents` provides a smaller Pi-specific execution boundary: one task-first `subagent` tool, fresh child contexts, foreground or background execution, explicit tool selection, and leaf children. The skill supplies the complete task; the extension does not require named Agent definitions.

## Decision

Use the exact package `@nijaru/pi-subagents@0.0.3` for Pi delegation and retire `pi-subagents-minimal` as an active runtime.

- The external skills own research and review instructions, model choices, capability requests, scope, and completion criteria.
- This repository does not duplicate or adapt those skill instructions.
- Pi resolves requested capabilities to its native tool names when invoking the extension.
- Claude Code and Codex use their own native delegation and editing tools; this Pi extension does not provide a cross-runtime adapter.
- No named Agent definitions are added.
- The exact dependency version remains pinned because the upstream package is pre-1.0.

## Consequences

The TypeScript implementation, tests, specifications, and release evidence in this repository become historical material. New executable work requires a new accepted decision that explicitly reactivates the local runtime. Routine maintenance is limited to recording replacement evidence or correcting historical documentation.

Upstream upgrades are deliberate version changes followed by a focused compatibility check. The replacement does not preserve this package's persistence envelopes, bounded report writer, or closed capability contract; those features are no longer product requirements.
