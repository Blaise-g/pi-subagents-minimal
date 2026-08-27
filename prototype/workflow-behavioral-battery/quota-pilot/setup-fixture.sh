#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out="$here/measurements/fixture-repo"
rm -rf "$out"
mkdir -p "$out/src" "$out/docs"
cp "$here/fixture/common/CODING_STANDARDS.md" "$out/"
cp "$here/fixture/common/docs/spec.md" "$out/docs/"
cp "$here/fixture/common/src/paths.ts" "$out/src/"
cp "$here/fixture/base/src/users.ts" "$out/src/"
git -C "$out" init -q
git -C "$out" config user.name "Battery Prototype"
git -C "$out" config user.email "battery@example.invalid"
git -C "$out" add .
git -C "$out" commit -qm "fixture base"
git -C "$out" tag battery-base
cp "$here/fixture/head/src/users.ts" "$out/src/"
git -C "$out" add src/users.ts
git -C "$out" commit -qm "implement user summary"
printf '%s\n' "$out"
