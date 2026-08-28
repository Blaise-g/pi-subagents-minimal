import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadExtensionHarness } from "./harness.ts";

const approvedFiles = [
  "LICENSE", "README.md", "agents/subagent.md", "package.json",
  "src/config.ts", "src/git-boundary.ts", "src/git-diff.ts", "src/index.ts", "src/persistence.ts", "src/projection.ts",
  "src/report.ts", "src/runtime.ts",
];

async function pack(): Promise<{ root: string; tarball: string; paths: string[] }> {
  const root = await mkdtemp(join(tmpdir(), "pi-subagents-pack-"));
  const process = Bun.spawn(["npm", "pack", "--json", "--pack-destination", root], {
    cwd: resolve("."), stdout: "pipe", stderr: "pipe",
  });
  const stdout = await new Response(process.stdout).text();
  const stderr = await new Response(process.stderr).text();
  expect(await process.exited, stderr).toBe(0);
  const parsed = JSON.parse(stdout) as Array<{ filename: string; files: Array<{ path: string }> }> | Record<string, { filename: string; files: Array<{ path: string }> }>;
  const records = Array.isArray(parsed) ? parsed : Object.values(parsed);
  expect(records).toHaveLength(1);
  return {
    root,
    tarball: join(root, records[0]!.filename),
    paths: records[0]!.files.map(({ path }) => path).sort(),
  };
}

test("exact packed artifact is allowlisted and self-describing", async () => {
  const { root, tarball, paths } = await pack();
  expect(paths).toEqual(approvedFiles);
  expect(paths.every((path) => !path.includes("\\") && !path.startsWith("/") && !path.includes("../"))).toBe(true);

  const unpacked = join(root, "unpacked");
  await Bun.$`mkdir -p ${unpacked}`;
  await Bun.$`tar -xzf ${tarball} -C ${unpacked}`;
  const packageRoot = join(unpacked, "package");
  expect((await readdir(packageRoot)).sort()).toEqual(["LICENSE", "README.md", "agents", "package.json", "src"]);

  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  expect(manifest.pi).toEqual({ extensions: ["./src/index.ts"] });
  expect(manifest.engines).toEqual({ node: ">=22.19.0" });
  expect(manifest.packageManager).toBe("bun@1.4.0");
  expect(manifest.dependencies).toBeUndefined();
  expect(manifest.peerDependencies).toEqual({
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-coding-agent": "*",
    typebox: "*",
  });
  expect(await readFile(join(packageRoot, "LICENSE"), "utf8")).toContain("MIT License");

  const externalImports = new Set<string>();
  for (const path of paths.filter((path) => path.startsWith("src/"))) {
    const source = await readFile(join(packageRoot, path), "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1]!;
      if (!specifier.startsWith(".") && !specifier.startsWith("node:")) externalImports.add(specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/"));
    }
  }
  expect([...externalImports].sort()).toEqual(Object.keys(manifest.peerDependencies).sort());

  const digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
  expect(digest).toMatch(/^[a-f0-9]{64}$/);

  await symlink(resolve("node_modules"), join(packageRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const typecheck = Bun.spawn([
    process.execPath, resolve("node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--skipLibCheck",
    "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--allowImportingTsExtensions",
    ...paths.filter((path) => path.startsWith("src/")).map((path) => join(packageRoot, path)),
  ], { cwd: packageRoot, stdout: "pipe", stderr: "pipe" });
  const typecheckError = await new Response(typecheck.stderr).text();
  expect(await typecheck.exited, typecheckError).toBe(0);

  const entry = join(packageRoot, manifest.pi.extensions[0]);
  const loaded = await loadExtensionHarness(entry);
  expect([...loaded.extension.tools.keys()]).toEqual(["delegation_control", "delegate"]);

  const { createExtension } = await import(entry);
  for (const piVersion of ["0.84.2", "0.85.0", "0.84.3-beta.1"]) {
    const effects = { tools: 0, handlers: 0, starts: 0, diagnostics: 0 };
    createExtension({ piVersion, nodeVersion: "22.19.0", writeStderr: () => effects.diagnostics++, startRuntime: () => effects.starts++ })({
      registerTool: () => effects.tools++, on: () => effects.handlers++,
    });
    expect(effects).toEqual({ tools: 0, handlers: 0, starts: 0, diagnostics: 1 });
  }
}, 30_000);
