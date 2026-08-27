# Releasing an exact version

`pi-subagents-minimal` is published only by `.github/workflows/release.yml`. A local `npm publish` is not a release path.

## Prerequisites

1. Close blockers #30, #31, and #32 after their CI checks pass.
2. Run and score the frozen full Behavioral battery. Commit its immutable records JSON without editing failed observations; `bun tools/behavioral-battery.ts verify <records.json>` must pass.
3. Run `bun run release:verify`, `bun run typecheck`, and `bun test`.
4. Commit a lockfile-clean checkout whose package version is the intended version, then create and push the matching tag (`v1.0.0` for package `1.0.0`).
5. Configure the GitHub `npm` environment with required reviewer protection. Configure npm trusted publishing for `release.yml`; `NPM_TOKEN` is a CI-only fallback for the initial publication before package-level trusted-publisher settings exist.

## Publication

From the matching tag, dispatch the **release** workflow with the exact version and repository-relative full-battery records path. The workflow refuses a branch, mismatched tag, dirty checkout, open blocker, missing evidence, or failed gate.

Before publishing it runs source/type, deterministic lifecycle, packed platform, Pi compatibility, Node compatibility, context-budget, frozen-oracle, and full provider-record gates. It packs once, verifies a fresh exact candidate install through Pi's public extension loader, computes SHA-256, and creates `release-record.json`. Only that tarball is passed to `npm publish --provenance --access public` from CI.

After publication, the workflow performs a fresh exact-version `pi install`, repeats the packed smoke check, and attaches the tarball, digest, and release record to the immutable GitHub tag release. The record includes the package version, commit, exact observed Pi/Node/Bun qualification versions, tarball digest, Behavioral-battery records digest, and workflow run identity.

The machine-checked assertion inventory is `docs/release-evidence.json`. It maps every canonical contract section, all 14 deterministic lifecycle cases, all packed release gates, and every section 15 change-to-evidence assertion to named evidence.
