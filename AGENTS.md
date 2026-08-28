# Project guidance

## Purpose and status

`pi-subagents-minimal` is a deliberately narrow Pi extension for this maintainer's bounded repository-analysis workflows. The current executable `0.1.0` package is for local dogfooding; the canonical contract targets `0.2.0`, not the planned published `1.0.0` release.

Preserve the minimal product boundary. Do not add implementation agents, arbitrary agent discovery, nested delegation, workflow graphs, unrestricted mutation, or external-web capabilities without a new specification decision.

## Canonical sources

- `CONTEXT.md` is the domain glossary. Keep it free of implementation details.
- `docs/spec/v1-implementation-contract.md` is the normative implementation contract.
- `docs/adr/0001-keep-model-evaluation-outside-release-automation.md` governs evaluation policy.
- `docs/adr/0002-use-one-subagent-profile-and-closed-additional-tools.md` governs role and capability authority.
- `agents/subagent.md` will be the exact package-owned role-neutral definition after the executable `0.2.0` migration; `agents/investigation.md` remains only in the current `0.1.0` implementation.
- `docs/release-evidence.json` maps currently implemented assertions to deterministic evidence and changes only when that evidence exists.
- GitHub issue #5 records instruction ownership for exploration and research.
- GitHub issue #9 retains the historical four-workflow scenarios and rationale; its Behavioral battery was superseded and must not be restored as a release gate.
- GitHub issues #18 and #33 track stable-package publication and verification.

Use `gh` according to `docs/agents/issue-tracker.md` when issue context is needed.

## Instruction ownership

Parent skills decide when to delegate, frame bounded task-specific objectives, and consume results. Existing `research`, `code-review-diff`, and `code-simplify` skills remain external to this package and own their workflow prompts.

The role-neutral Subagent definition owns durable child behavior and capability discipline. Parent skills own optional Task roles/lenses. A Task specification should contain only its objective, scope, useful starting points, answer requirements, optional selected additional tools, and optional declared report path; do not duplicate durable definition policy in every Task.

## Development

Required runtime boundaries are stable Pi `>=0.84.3 <0.85.0` and Node `>=22.19.0`. Bun is development-only and pinned by `packageManager`.

Run focused tests while changing behavior, then finish with:

```sh
bun run release:verify
bun run typecheck
bun test
```

Every executable behavior must be anchored to the canonical contract and receive defect-revealing red proof before green verification. Documentation-only changes do not require synthetic tests; verify their links, commands, and consistency with the canonical sources.

Model evaluation is optional supporting evidence, not CI or release qualification. Use a one-off Recorded evaluation or Quality smoke only to answer a concrete behavioral question, especially after a Significant behavioral change.
