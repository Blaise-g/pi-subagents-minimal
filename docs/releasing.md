# Releasing an exact version

`pi-subagents-minimal` is currently versioned `0.2.0` for local validation. Local path installation is documented in the README and does not use this procedure. Its deterministic dogfood qualification is recorded separately in [`dogfood-qualification.json`](dogfood-qualification.json); it is neither a stable publication record nor a model-quality claim.

A public package version is published only by `.github/workflows/release.yml`. A local `npm publish` is not a release path. Stable `1.0.0` publication is deliberately deferred until public distribution is useful; first set the package version to `1.0.0` in a reviewed commit, then follow every step below.

## Prerequisites

1. Run `bun run release:verify`, `bun run typecheck`, and `bun test`.
2. Commit a lockfile-clean checkout whose package version is the intended version, then create and push the matching tag (`v1.0.0` for package `1.0.0`).
3. Configure the GitHub `npm` environment with required reviewer protection. Configure npm trusted publishing for `release.yml`; `NPM_TOKEN` is a CI-only fallback for the initial publication before package-level trusted-publisher settings exist.

If a tagged candidate fails before npm publication and a release fix is subsequently merged, the unpublished tag may be replaced deliberately: verify that the exact version is absent from npm and that no GitHub release exists, delete the old remote tag, create the same tag at the final clean release commit, and record the replacement on the release ticket. Never move a tag after publication or silently dispatch a commit different from the tag target.

## Publication

From the matching tag, dispatch the **release** workflow with the exact version. The workflow refuses a branch, mismatched tag, dirty checkout, missing evidence, or failed deterministic gate.

Before publishing it verifies exact version/tag/commit identity, source and lifecycle behavior, context budgets, packed platform compatibility, and supported Node and Pi versions. It packs once, verifies a fresh exact candidate install through Pi's public extension loader, computes SHA-256, and creates `release-record.json`. Only that tarball is passed to `npm publish --provenance --access public` from the protected npm environment.

After publication, the workflow performs a fresh exact-version `pi install`, repeats the packed smoke check, and attaches the tarball, digest, and release record to the immutable GitHub tag release. The record contains package identity, source commit and tag, tarball digest, sorted exact Pi/Node/Bun qualification environments, and workflow identity. It does not certify model-output quality; any model evaluation is separate supporting material and is not a publication gate.

The machine-checked assertion inventory is `docs/release-evidence.json`. It maps every canonical contract section, all 18 deterministic lifecycle cases, all packed release gates, and every section 15 change-to-evidence assertion to named evidence.
