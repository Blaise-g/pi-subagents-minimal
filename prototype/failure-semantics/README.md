# Failure-semantics A/B prototype

Throwaway comparison for [Compare v1 and Arhen failure semantics](https://github.com/Blaise-g/pi-subagents-minimal/issues/12).

It asks whether the contract selected in **Define concurrency, cancellation, and failure semantics** is clearer, more bounded, and more recoverable than `@arhen/pi-core-subagent` 1.3.46—and whether that gain justifies its extra lifecycle states.

## Inspect manually

Open [`index.html`](index.html) directly. The guided scenarios expose each state transition and the final parent-visible projection side by side. No server or install is needed.

## Run the model checks

```sh
bun prototype/failure-semantics/run.ts
```

This runs every source-anchored observation twice with `openai-codex/gpt-5.6-luna` at medium Thinking level, no tools, no repository context, no skills, and no extensions. Raw Pi JSONL is gzip-compressed in `results/`; [`results/summary.md`](results/summary.md) scores exact operator-comprehension fields.

Set `REPETITIONS` or `CONCURRENCY` to override the defaults.

## Boundary

The runtime observations are deterministic projections derived from the two contracts; this does **not** inject failures into either production runtime or estimate reliability. The Luna check tests whether a parent model correctly reads the observable outcomes. The manual state walkthrough tests whether the extra v1 phases carry operational meaning.

See [`FINDINGS.md`](FINDINGS.md) for source anchors, verdict, and proposed specification changes.
