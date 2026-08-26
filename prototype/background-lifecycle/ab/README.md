# Lifecycle A/B/C prototype

Throwaway comparison for **Define the minimal background lifecycle contract**. It asks whether background control earns its cost, and whether one dynamically exposed control tool is sufficient compared with an Arhen-style permanent lifecycle suite.

## Variants

- `official-style.ts`: one foreground `delegate` call waits and directly returns a terminal result.
- `minimal-background.ts`: deterministic fake background runtime with always-active `delegate` and dynamically active `delegation_control` (`inspect | cancel`).
- `arhen-style.ts`: deterministic fake background runtime with permanent launch, status, result, await, and cancel tools.
- `minimal-real.ts`: smoke-only implementation of the proposed lifecycle over public in-process Pi child sessions.

The deterministic variants deliberately share the same fake lifecycle. They compare parent-facing contract shape, not implementation reliability. The official-style variant normalizes the official Pi example's foreground behavior but does not copy its subprocess runtime. The reduced Arhen-style variant copies lifecycle shape, not Arhen's graph, persistence, steering, or runtime.

## Run

```sh
./run.sh
```

The script runs four matched scenarios with parent model `openai-codex/gpt-5.6-luna` at medium Thinking level and writes `results/summary.md`. It requires configured OpenAI Codex authentication. Raw event streams and first-request payloads from the captured run are committed gzip-compressed in `results/`.

## Captured result

See [`results/summary.md`](results/summary.md) for the normalized run and [`results/real-smoke.md`](results/real-smoke.md) for the real Arhen/minimal smoke comparison.

This prototype intentionally has no production abstractions or automated tests. Syntax and behavior were checked by running every captured scenario; the real smoke exercised actual Pi child sessions on both leading background shapes.
