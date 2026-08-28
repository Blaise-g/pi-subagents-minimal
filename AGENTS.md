# Project guidance

Preserve this package's deliberately narrow boundary. Do not add implementation Subagents, arbitrary Agent or tool discovery, nested delegation, workflow graphs, unrestricted mutation, or external-web capabilities without an approved specification decision.

## Agent skills

### Issue tracker

Issues and specifications are tracked in GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the repository's five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## Development

`docs/spec/v1-implementation-contract.md` is normative. Every executable behavior must be anchored to it and receive defect-revealing red proof before green verification.

Run focused checks while developing, then finish with:

```sh
bun run release:verify
bun run typecheck
bun test
```

Documentation-only changes require link, command, and canonical-source consistency checks rather than synthetic tests.

Model evaluation is optional supporting evidence under ADR 0001, never CI or release qualification.
