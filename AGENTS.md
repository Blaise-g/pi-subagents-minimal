# Project guidance

This repository contains the retired `pi-subagents-minimal` runtime. Follow [ADR 0003](docs/adr/0003-replace-local-runtime-with-task-first-extension.md). Treat the implementation and its supporting material as historical; do not duplicate the external workflow skills, add named Agent definitions, or change executable behavior without an accepted reactivation decision.

## Agent skills

### Issue tracker

Issues and specifications are tracked in GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the repository's five canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## Development

`docs/spec/v1-implementation-contract.md` is the historical contract for the retired runtime.

If an accepted decision reactivates executable development, run focused checks while developing, then finish with:

```sh
bun run release:verify
bun run typecheck
bun test
```

Documentation-only changes require link, command, and canonical-source consistency checks rather than synthetic tests.

Model evaluation is optional supporting evidence under ADR 0001, never CI or release qualification.
