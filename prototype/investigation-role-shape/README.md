# PROTOTYPE — Investigation role shape

## Question

Does one combined Investigation Agent definition preserve the behavior of separate Research and Exploration definitions while reducing the role surface? The combined definition should be preferred only if it matches specialized definitions on correctness and answer discipline without materially increasing child input cost or unnecessary tool work.

## Design

Four matched tasks run against the installed Pi 0.84.3 package: two bounded repository explorations and two evidence-intensive source investigations. Each task runs once with the combined definition and once with the matching specialized definition, using the same model, thinking level, cwd, tools, and resource-discovery exclusions.

This is a directional prototype, not the frozen behavioral battery: one stochastic run cannot establish reliability. Compare factual correctness, required evidence, scope discipline, tool-call count, and input/output usage.

## Run

```bash
bash prototype/investigation-role-shape/run.sh
```

Results are written under `results/` as Pi JSON event streams.
