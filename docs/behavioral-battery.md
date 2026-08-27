# Behavioral battery operations

The quality claim is restricted to the fixture commit, Pi/package versions, and `openai-codex/gpt-5.6-luna` at `low`, `medium`, and `high` Thinking recorded by the harness.

- `bun run battery:test` validates frozen prompts, fixture preparation, matrix shape, and evidence policy without a provider.
- `bun run battery:plan` writes the 36-trial/63-child full plan to `artifacts/behavioral/plan.json`.
- `bun tools/behavioral-battery.ts plan artifacts/behavioral/low.json --thinking=low --sweep` writes the weekly four-trial/seven-child sweep.
- `bun tools/behavioral-battery.ts verify records.json` certifies scored full-matrix records. It requires exact prompts and tuples, execution metadata, event streams, Terminal envelopes, usage, wall time, and all deterministic and predeclared human checks to pass.

The oracle inventory is versioned under `test/behavioral/oracles/`, separate from the fixture repository copied into Subagent-visible context. Prepare review fixtures with:

```sh
bash tools/prepare-battery-fixture.sh /tmp/review committed
bash tools/prepare-battery-fixture.sh /tmp/simplification uncommitted
```

For diff review, force the two children to complete Spec then Standards and verify that the aggregate remains Standards then Spec. Simplification must use the uncommitted fixture. A failed observed trial is retained as failed. Correct an ambiguous oracle before rerunning its entire scenario/Thinking cell; never edit or waive a result after inspection.

`.github/workflows/behavioral-battery.yml` provides the weekly/manual non-blocking low sweep plan and blocking full-matrix evidence gate for releases and material battery changes. Provider execution is deliberately credentialed/HITL: upload committed scored records and invoke `full`; the verifier, not a model judge, decides the gate.
