# Minimal Subagents for Pi

This repository preserves the retired `pi-subagents-minimal@0.2.0` runtime for design history. Pi now uses the pinned task-first extension `@nijaru/pi-subagents@0.0.3`; see [ADR 0003](docs/adr/0003-replace-local-runtime-with-task-first-extension.md).

## Active Pi setup

Install the replacement with:

```sh
pi install npm:@nijaru/pi-subagents@0.0.3
```

The external workflow skills provide complete delegated tasks. The replacement extension executes them, while its bundled `pi-subagents` skill documents only executor lifecycle and tool calls. See ADR 0003 for the ownership boundary.

## Repository status

The implementation under `extensions/` and `src/`, its tests, release tooling, and the [v1 implementation contract](docs/spec/v1-implementation-contract.md) describe the former local runtime. They are historical material and are not the qualification suite for the replacement package.

No public release of `pi-subagents-minimal` is planned.
