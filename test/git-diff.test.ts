import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitBoundary } from "../src/git-boundary.ts";
import { renderGitDiff, renderWorkingTree } from "../src/git-diff.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
async function git(cwd: string, ...args: string[]) { const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" }); const [code, out, error] = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()]); if (code) throw new Error(error); return out.trim(); }
async function repo() { const root = await mkdtemp(join(tmpdir(), "pi-working-diff-")); roots.push(root); await git(root, "init", "-q"); await git(root, "config", "user.name", "Test"); await git(root, "config", "user.email", "test@example.invalid"); await writeFile(join(root, "staged.txt"), "before\n"); await writeFile(join(root, "unstaged.txt"), "before\n"); await git(root, "add", "."); await git(root, "commit", "-qm", "base"); return root; }

test("renders staged, unstaged, and non-ignored untracked working-tree evidence", async () => {
  const root = await repo();
  await writeFile(join(root, "staged.txt"), "staged\n"); await git(root, "add", "staged.txt");
  await writeFile(join(root, "unstaged.txt"), "unstaged\n"); await writeFile(join(root, "untracked.txt"), "new\n");
  await writeFile(join(root, ".gitignore"), "ignored.txt\n"); await writeFile(join(root, "ignored.txt"), "secret\n");
  const rendered = await renderWorkingTree(await createGitBoundary(root));
  expect(rendered.content).toContain("Comparison: working tree from HEAD");
  expect(rendered.content).toContain("staged.txt"); expect(rendered.content).toContain("unstaged.txt"); expect(rendered.content).toContain("untracked.txt");
  expect(rendered.content).not.toContain("ignored.txt");
  expect(rendered.details).toMatchObject({ comparison: "working_tree", changedFiles: 2, untrackedFiles: 2, patchIncluded: true });
  expect(JSON.stringify(rendered.details)).not.toContain("Raw patch");
});

test("compares an unborn HEAD against Git's empty tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-working-diff-unborn-")); roots.push(root); await git(root, "init", "-q"); await writeFile(join(root, "new.txt"), "new\n");
  const rendered = await renderWorkingTree(await createGitBoundary(root));
  expect(rendered.content).toContain("Observed HEAD: unborn"); expect(rendered.content).toContain("new.txt");
});

test("reports a clean tree explicitly and omits an oversized aggregate patch in full", async () => {
  const root = await repo(); const boundary = await createGitBoundary(root, { maxOutputBytes: 200_000 });
  expect((await renderWorkingTree(boundary)).content).toContain("No changes.");
  await writeFile(join(root, "staged.txt"), "x".repeat(70_000));
  const rendered = await renderWorkingTree(boundary);
  expect(rendered.details.patchIncluded).toBe(false);
  expect(rendered.content).toContain("Raw patch omitted"); expect(rendered.content).not.toContain("x".repeat(100));
  expect(Buffer.byteLength(rendered.content)).toBeLessThanOrEqual(80 * 1024);
});

test("compares a fixed point merge base through committed and working-tree changes", async () => {
  const root = await repo(); const fixed = await git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "committed.txt"), "committed\n"); await git(root, "add", "."); await git(root, "commit", "-qm", "branch work");
  await writeFile(join(root, "unstaged.txt"), "working\n"); await writeFile(join(root, "untracked.txt"), "untracked\n");
  const rendered = await renderGitDiff(await createGitBoundary(root), { comparison: "since", fixedPoint: fixed });
  expect(rendered.content).toContain(`Resolved fixed point: ${fixed}`);
  expect(rendered.content).toContain("branch work");
  expect(rendered.content).toContain("committed.txt"); expect(rendered.content).toContain("unstaged.txt"); expect(rendered.content).toContain("untracked.txt");
  expect(rendered.details).toMatchObject({ comparison: "since", resolvedFixedPoint: fixed, changedFiles: 2, untrackedFiles: 1 });
});

test("fixed point ahead of HEAD uses HEAD as merge base and an explicit empty summary", async () => {
  const root = await repo(); const head = await git(root, "rev-parse", "HEAD");
  await git(root, "checkout", "-qb", "ahead"); await writeFile(join(root, "ahead.txt"), "ahead\n"); await git(root, "add", "."); await git(root, "commit", "-qm", "ahead"); const ahead = await git(root, "rev-parse", "HEAD");
  await git(root, "checkout", "-q", head); await writeFile(join(root, "unstaged.txt"), "local\n");
  const rendered = await renderGitDiff(await createGitBoundary(root), { comparison: "since", fixedPoint: ahead });
  expect(rendered.details.resolvedBase).toBe(head); expect(rendered.content).toContain("Commit summary:\n(empty)"); expect(rendered.content).toContain("unstaged.txt");
});

test("literal path filtering includes both rename endpoints and exact UTF-8 truncation metadata", async () => {
  const root = await repo(); await git(root, "mv", "staged.txt", "renamed.txt");
  const renamed = await renderGitDiff(await createGitBoundary(root), { comparison: "working_tree", path: "staged.txt" });
  expect(renamed.content).toContain("staged.txt -> renamed.txt"); expect(renamed.content).toContain("rename from staged.txt"); expect(renamed.content).toContain("rename to renamed.txt");
  await writeFile(join(root, "unstaged.txt"), "é".repeat(40_000));
  const large = await renderGitDiff(await createGitBoundary(root, { maxOutputBytes: 200_000 }), { comparison: "working_tree", path: "unstaged.txt" });
  expect(large.details).toMatchObject({ patchIncluded: true, patchTruncated: true, retainedPatchBytes: 65536 });
  expect(large.content).toContain("evidence is incomplete"); expect(Buffer.from(large.content).toString("utf8")).not.toContain("�");
});

test("since fails explicitly when HEAD does not exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-since-unborn-")); roots.push(root); await git(root, "init", "-q");
  await expect(renderGitDiff(await createGitBoundary(root), { comparison: "since", fixedPoint: "HEAD" })).rejects.toThrow("GIT_HISTORY_INCOMPLETE");
});
