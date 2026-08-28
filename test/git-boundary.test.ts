import { afterEach, describe, expect, test } from "bun:test";
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitBoundary, GitBoundaryError, validateFixedPoint, validateLiteralPath } from "../src/git-boundary.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function temporary() { const root = await mkdtemp(join(tmpdir(), "pi-git-boundary-")); roots.push(root); return root; }
async function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = Bun.spawn(["git", ...args], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code) throw new Error(stderr); return stdout.trim();
}
async function repository() { const root = await temporary(); await git(root, ["init", "-q"]); await git(root, ["config", "user.name", "Test"]); await git(root, ["config", "user.email", "test@example.invalid"]); await writeFile(join(root, "tracked.txt"), "before\n"); await git(root, ["add", "tracked.txt"]); await git(root, ["commit", "-qm", "initial"]); return root; }

for (const value of ["-HEAD", "HEAD\nmain", "HEAD\0main", "", "a".repeat(1025)]) test(`rejects unsafe fixed point ${JSON.stringify(value.slice(0, 10))}`, () => expect(() => validateFixedPoint(value)).toThrow(GitBoundaryError));
for (const value of ["../outside", "/absolute", "C:/absolute", ":(glob)**", "-option", "a\\b", "a\nb", "a//b", ".", "a/../b"]) test(`rejects unsafe literal path ${JSON.stringify(value)}`, () => expect(() => validateLiteralPath(value)).toThrow(GitBoundaryError));

describe("guarded Git process boundary", () => {
  test("discovers the nearest canonical ordinary repository and worktree roots", async () => {
    const root = await repository(); await mkdir(join(root, "nested", "deep"), { recursive: true });
    expect((await createGitBoundary(join(root, "nested", "deep"))).root).toBe(await realpath(root));
    const worktree = join(await temporary(), "worktree"); await git(root, ["worktree", "add", "-q", "-b", "worktree-test", worktree]); await mkdir(join(worktree, "nested"));
    expect((await createGitBoundary(join(worktree, "nested"))).root).toBe(await realpath(worktree));
  });

  test("resolves commits and reads stable literal diffs without mutating repository state", async () => {
    const root = await repository(); await writeFile(join(root, "tracked.txt"), "after\n");
    const beforeStatus = await git(root, ["status", "--porcelain=v1"]); const before = { head: await git(root, ["rev-parse", "HEAD"]), index: await readFile(join(root, ".git", "index")), contents: await readFile(join(root, "tracked.txt"), "utf8") };
    const boundary = await createGitBoundary(root); const head = await boundary.resolveCommit("HEAD"); const result = await boundary.diff(head, "tracked.txt");
    expect(result.stdout).toContain("diff --git a/tracked.txt b/tracked.txt"); expect(result.stdout).toContain("@@ -1 +1 @@");
    const after = { head: await git(root, ["rev-parse", "HEAD"]), index: await readFile(join(root, ".git", "index")), contents: await readFile(join(root, "tracked.txt"), "utf8") }; const afterStatus = await git(root, ["status", "--porcelain=v1"]);
    expect(after.head).toBe(before.head); expect(afterStatus).toBe(beforeStatus); expect(after.contents).toBe(before.contents); expect(after.index).toEqual(before.index);
  });

  test("neutralizes hostile Git execution hooks and ambient Git variables", async () => {
    const root = await repository(); const canary = join(root, "canary"); const command = `touch ${JSON.stringify(canary)}`;
    await git(root, ["config", "core.fsmonitor", command]); await git(root, ["config", "diff.external", command]); await git(root, ["config", "pager.diff", command]); await git(root, ["config", "alias.diff", `!${command}`]); await git(root, ["config", "diff.hostile.textconv", command]); await git(root, ["config", "diff.hostile.command", command]); await writeFile(join(root, ".gitattributes"), "*.txt diff=hostile\n"); await writeFile(join(root, "tracked.txt"), "changed\n");
    const previous = { GIT_DIR: process.env.GIT_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE, GIT_EXTERNAL_DIFF: process.env.GIT_EXTERNAL_DIFF, GIT_CONFIG_COUNT: process.env.GIT_CONFIG_COUNT };
    Object.assign(process.env, { GIT_DIR: join(root, "missing"), GIT_WORK_TREE: join(root, "missing"), GIT_EXTERNAL_DIFF: command, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.pager", GIT_CONFIG_VALUE_0: command });
    try { const boundary = await createGitBoundary(root); await boundary.diff(await boundary.resolveCommit("HEAD")); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; delete process.env.GIT_CONFIG_KEY_0; delete process.env.GIT_CONFIG_VALUE_0; }
    expect(await lstat(canary).then(() => true, () => false)).toBe(false);
  });

  test("fails closed with bounded sanitized errors for missing repositories and output overflow", async () => {
    const outside = await temporary(); await expect(createGitBoundary(outside)).rejects.toMatchObject({ code: "GIT_REPOSITORY_UNAVAILABLE" });
    const root = await repository(); await writeFile(join(root, "tracked.txt"), "x".repeat(100_000)); const boundary = await createGitBoundary(root, { maxOutputBytes: 1024 });
    await expect(boundary.diff(await boundary.resolveCommit("HEAD"))).rejects.toMatchObject({ code: "GIT_OUTPUT_OVERFLOW" });
    try { await boundary.diff("not-a-commit"); throw new Error("expected failure"); } catch (error) { expect(error).toBeInstanceOf(GitBoundaryError); expect(Buffer.byteLength((error as Error).message)).toBeLessThanOrEqual(512); expect((error as Error).message).not.toContain(root); }
  });
});
