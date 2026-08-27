# Behavioral battery operations

The quality claim is restricted to the fixture commit, Pi/package versions, and `openai-codex/gpt-5.6-luna` at `low`, `medium`, and `high` Thinking recorded by the harness.

- `bun run battery:test` validates frozen prompts, fixture preparation, matrix shape, and evidence policy without a provider.
- `bun run battery:plan` writes the 36-trial/63-child full plan to `artifacts/behavioral/plan.json`.
- `bun tools/behavioral-battery.ts plan artifacts/behavioral/low.json --thinking=low --sweep` writes the weekly four-trial/seven-child sweep.
- `bun tools/behavioral-battery.ts verify records.json` certifies scored full-matrix records. It requires exact prompts and tuples, non-placeholder execution metadata, event streams, successful Terminal envelopes for every effective child tuple, usage, wall time, named human-review evidence, and every predeclared binary check to pass.
- `bun run battery:run artifacts/behavioral/provider-run` executes the provider-backed matrix from a clean committed checkout. It uses the exact installed Pi, `openai-codex/gpt-5.6-luna`, versioned review-skill snapshots, isolated fixture workspaces, and fresh persisted parent sessions. Each observation is written once and is never overwritten.

The oracle inventory is versioned under `test/behavioral/oracles/`, separate from the fixture repository copied into Subagent-visible context. Prepare review fixtures with:

```sh
bash tools/prepare-battery-fixture.sh /tmp/review committed
bash tools/prepare-battery-fixture.sh /tmp/simplification uncommitted
```

For diff review, force the two children to complete Spec then Standards and verify that the aggregate remains Standards then Spec. Simplification must use the uncommitted fixture. A failed observed trial is retained as failed. Correct an ambiguous oracle before rerunning its entire scenario/Thinking cell; never edit or waive a result after inspection.

## Provider execution and human review

1. Commit the harness and fixture state, require a clean checkout, and confirm `pi --version` and `pi auth status --provider openai-codex` without printing credentials.
2. Run `bun run battery:run artifacts/behavioral/provider-run`. Use `--trial=<id>` only for harness diagnosis; it is not full evidence. A full run writes 36 immutable files under `observations/`. Preserve failed files and use a new run directory for any oracle-policy rerun.
3. Generate the hidden operator packet and blank scorecard with `bun run battery:review artifacts/behavioral/provider-run/observations artifacts/behavioral/provider-run/scorecard.json`.
4. A human—not a model that produced or is currently judging its own answers—reviews every terminal answer and captured report against the packet's predeclared binary inventory. The human enters reviewer identity, an ISO review time, and an explicit `true` or `false` for every check. Keep the packet and scorecard outside Subagent fixture context.
5. Run `bun run battery:finalize artifacts/behavioral/provider-run/observations artifacts/behavioral/provider-run/scorecard.json artifacts/behavioral/records-v1.0.0.json`. Finalization preserves false outcomes and refuses blanks; it never converts a failure into a pass.
6. Require `bun tools/behavioral-battery.ts verify artifacts/behavioral/records-v1.0.0.json` to print `PASS: 36 trials, 63 child sessions`, then commit the records and human scorecard as immutable release evidence.

The runner disables discovered parent extensions, skills, prompts, themes, context files, and built-in tools; explicitly loads only this extension and the versioned participating review skill. The extension independently disables those resources in children. Frozen oracle files are read only by review/finalization and are never copied to trial workspaces.

`.github/workflows/behavioral-battery.yml` provides the weekly/manual non-blocking low sweep plan and blocking full-matrix evidence gate for releases and material battery changes. Provider execution is deliberately credentialed/HITL: upload committed scored records and invoke `full`; the verifier, not a model judge, decides the gate.
