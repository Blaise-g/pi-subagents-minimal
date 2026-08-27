#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:?usage: prepare-battery-fixture.sh OUTPUT [committed|uncommitted]}
mode=${2:-committed}
rm -rf "$out"
mkdir -p "$out/src" "$out/docs"
cp "$root/test/behavioral/fixtures/review/common/CODING_STANDARDS.md" "$out/"
cp "$root/test/behavioral/fixtures/review/common/docs/spec.md" "$out/docs/"
cp "$root/test/behavioral/fixtures/review/common/src/paths.ts" "$out/src/"
cp "$root/test/behavioral/fixtures/review/base/src/users.ts" "$out/src/"
git -C "$out" init -q
git -C "$out" config user.name "Behavioral Battery"
git -C "$out" config user.email "battery@example.invalid"
git -C "$out" add .
git -C "$out" commit -qm "fixture base"
git -C "$out" tag battery-base
cp "$root/test/behavioral/fixtures/review/head/src/users.ts" "$out/src/"
if [[ "$mode" == committed ]]; then
  git -C "$out" add src/users.ts
  git -C "$out" commit -qm "implement user summary"
elif [[ "$mode" != uncommitted ]]; then
  echo "mode must be committed or uncommitted" >&2; exit 2
fi
