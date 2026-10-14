# Minimal Subagents for Pi

This repository preserves the retired `pi-subagents-minimal@0.2.0` runtime for design history. Pi now uses badlogic's task-first `@earendil-works/pi-subagent` extension at an inspected commit; see [ADR 0003](docs/adr/0003-replace-local-runtime-with-task-first-extension.md).

## Active Pi setup

Prerequisites: Pi, Node.js 22.19+, and tmux. On macOS, install tmux with `brew install tmux`. Install the inspected upstream revision following its directory/CLI layout:

```sh
git clone https://github.com/earendil-works/pi-subagent.git ~/.pi/agent/extensions/subagent
git -C ~/.pi/agent/extensions/subagent checkout --detach 4fc1fe5178d1a2b474794a5ee39e7295844e9d3c
mkdir -p ~/.pi/agent/bin
ln -s ../extensions/subagent/subagent.ts ~/.pi/agent/bin/subagent
```

Keep `~/.pi/agent/bin` on `PATH`. When migrating from the previous replacement, remove it with `pi remove npm:@nijaru/pi-subagents@0.0.3`, then run `/reload` or restart Pi. The clone and symlink commands assume those destinations do not already exist.

The external workflow skills provide complete delegated tasks. The upstream extension contributes its bundled `subagent` skill for CLI lifecycle operations; no local runtime or named Agent definitions are added. Collect background results with `subagent wait`; completion does not automatically wake the parent. Save needed reports before `subagent stop`, which deletes the conversation. See ADR 0003 for the ownership boundary.

## Repository status

The implementation under `extensions/` and `src/`, its tests, release tooling, and the [v1 implementation contract](docs/spec/v1-implementation-contract.md) describe the former local runtime. They are historical material and are not the qualification suite for the replacement package.

No public release of `pi-subagents-minimal` is planned.
