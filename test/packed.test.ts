import { expect, test } from "bun:test";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { loadExtensionHarness } from "./harness.ts";

test("packed artifact is allowlisted and loads through Pi", async () => {
  const destination = await mkdtemp(join(tmpdir(), "pi-subagents-pack-"));
  const process = Bun.spawn(["npm", "pack", "--json", "--pack-destination", destination], {
    cwd: resolve("."), stdout: "pipe", stderr: "pipe",
  });
  const output = await new Response(process.stdout).text();
  expect(await process.exited).toBe(0);
  const packed = JSON.parse(output) as Record<string, { filename: string; files: Array<{ path: string }> }>;
  const { filename, files } = Object.values(packed)[0]!;
  const paths = files.map(({ path }) => path).sort();
  expect(paths.every((path) => /^(LICENSE|README\.md|package\.json|agents\/|src\/)/.test(path))).toBe(true);
  expect(paths).toContain("src/index.ts");
  expect(paths).toContain("agents/investigation.md");

  const unpacked = join(destination, "unpacked");
  await $`mkdir -p ${unpacked}`;
  await $`tar -xzf ${join(destination, filename)} -C ${unpacked}`;
  expect(await readdir(join(unpacked, "package"))).toContain("package.json");
  const loaded = await loadExtensionHarness(join(unpacked, "package", "src", "index.ts"));
  expect([...loaded.extension.tools.keys()]).toEqual(["delegation_control", "delegate"]);
});
