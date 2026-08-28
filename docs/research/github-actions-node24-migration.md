# GitHub Actions Node 24 migration

Date: 2026-08-28

## Finding

GitHub's Node 20 runner deprecation guidance says to update JavaScript actions to releases that run on Node 24 rather than rely on the runner's forced-runtime compatibility behavior. Node 24 actions require Actions Runner `v2.327.1` or newer; this repository uses GitHub-hosted runners, so no self-hosted runner rollout is required.

The workflow's first-party GitHub actions had these supported Node 24 generations:

- `actions/checkout@v5` declares `runs.using: node24`.
- `actions/setup-node@v5` declares `runs.using: node24`.
- `actions/upload-artifact@v6` declares `runs.using: node24`.
- `actions/download-artifact@v7` declares `runs.using: node24`.

`oven-sh/setup-bun@v2` already declares `runs.using: node24`, so it needs no migration. The change can therefore remain version-only; workflow inputs and behavior do not need redesign.

## Primary sources

- [GitHub Changelog: Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)
- [`actions/checkout` v5 action metadata](https://github.com/actions/checkout/blob/v5/action.yml)
- [`actions/setup-node` v5 action metadata](https://github.com/actions/setup-node/blob/v5/action.yml)
- [`actions/upload-artifact` v6 action metadata](https://github.com/actions/upload-artifact/blob/v6/action.yml)
- [`actions/download-artifact` v7 action metadata](https://github.com/actions/download-artifact/blob/v7/action.yml)
- [`oven-sh/setup-bun` v2 action metadata](https://github.com/oven-sh/setup-bun/blob/v2/action.yml)
