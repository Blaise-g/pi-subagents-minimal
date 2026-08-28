import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

export type GitBoundaryErrorCode = "GIT_UNAVAILABLE" | "GIT_REPOSITORY_UNAVAILABLE" | "GIT_UNSAFE_REPOSITORY" | "GIT_HISTORY_INCOMPLETE" | "GIT_TIMEOUT" | "GIT_OUTPUT_OVERFLOW" | "GIT_INPUT_INVALID" | "GIT_PROCESS_FAILED" | "GIT_OUTPUT_INVALID";
export class GitBoundaryError extends Error {
  constructor(readonly code: GitBoundaryErrorCode, message: string) { super(`[${code}] ${bounded(message)}`); this.name = "GitBoundaryError"; }
}
export type GitProcessResult = { stdout: string; stderr: string };
type BoundaryOptions = { timeoutMs?: number; maxOutputBytes?: number };
const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_OUTPUT = 80 * 1024;
const CONTROL = /[\x00-\x1f\x7f]/;
const bounded = (message: string) => {
  const clean = message.replace(/(?:[A-Za-z]:)?[/\\](?:[^\s/\\]+[/\\])+[^\s]*/g, "[path]").replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  const data = Buffer.from(clean || "Git inspection failed", "utf8");
  if (data.length <= 500) return clean || "Git inspection failed";
  let end = 500; while (end && (data[end]! & 0xc0) === 0x80) end--; return data.subarray(0, end).toString("utf8");
};
const failureCode = (stderr: string): GitBoundaryErrorCode => /dubious ownership|safe\.directory/i.test(stderr) ? "GIT_UNSAFE_REPOSITORY" : "GIT_PROCESS_FAILED";

export function validateFixedPoint(value: string): string {
  if (!value || Buffer.byteLength(value) > 1024 || value.startsWith("-") || CONTROL.test(value)) throw new GitBoundaryError("GIT_INPUT_INVALID", "Fixed point must be 1..1024 bytes and cannot begin with '-' or contain control separators");
  return value;
}
export function validateLiteralPath(value: string): string {
  if (!value || Buffer.byteLength(value) > 4096 || CONTROL.test(value) || /[\\*?\[]/.test(value) || isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.startsWith("-") || value.startsWith(":") || value === ".") throw new GitBoundaryError("GIT_INPUT_INVALID", "Path must be a normalized project-relative literal path");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new GitBoundaryError("GIT_INPUT_INVALID", "Path traversal and empty segments are not permitted");
  return value;
}
function environment(): NodeJS.ProcessEnv {
  const keep = process.platform === "win32" ? ["Path", "PATH", "PATHEXT", "SystemRoot", "SYSTEMROOT", "ComSpec", "COMSPEC", "TEMP", "TMP"] : ["PATH", "TMPDIR"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, { LC_ALL: "C", LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat", PAGER: "cat" });
  return env;
}
const fixedConfig = ["-c", "core.fsmonitor=false", "-c", "core.pager=cat", "-c", "pager.diff=false", "-c", "color.ui=false", "-c", "diff.external=", "-c", "diff.trustExitCode=false", "-c", "diff.noprefix=false", "-c", "diff.mnemonicPrefix=false", "-c", "diff.srcPrefix=a/", "-c", "diff.dstPrefix=b/", "-c", "diff.context=3", "-c", "diff.renames=true", "-c", "core.quotePath=false", "-c", "diff.suppressBlankEmpty=false", "-c", "log.showSignature=false"] as const;

async function invoke(cwd: string, command: readonly string[], options: Required<BoundaryOptions>): Promise<GitProcessResult> {
  return await new Promise((resolvePromise, reject) => {
    let settled = false, overflow = false; const stdout: Buffer[] = [], stderr: Buffer[] = []; let outBytes = 0, errBytes = 0;
    let child;
    try { child = spawn("git", [...fixedConfig, "--no-optional-locks", ...command], { cwd, env: environment(), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }); child.stdin.end(); }
    catch { reject(new GitBoundaryError("GIT_UNAVAILABLE", "A supported Git executable is unavailable")); return; }
    const finishError = (error: GitBoundaryError) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
    const collect = (chunks: Buffer[], count: number, chunk: Buffer) => { const next = count + chunk.length; if (next > options.maxOutputBytes) { overflow = true; child.kill(); } else chunks.push(chunk); return next; };
    child.stdout.on("data", (chunk: Buffer) => { outBytes = collect(stdout, outBytes, chunk); }); child.stderr.on("data", (chunk: Buffer) => { errBytes = collect(stderr, errBytes, chunk); });
    child.on("error", () => finishError(new GitBoundaryError("GIT_UNAVAILABLE", "A supported Git executable is unavailable")));
    child.on("close", (code) => { if (settled) return; settled = true; clearTimeout(timer); if (overflow) { reject(new GitBoundaryError("GIT_OUTPUT_OVERFLOW", "Git process output exceeded its bounded buffer")); return; } let out: string, err: string; try { const decoder = new TextDecoder("utf-8", { fatal: true }); out = decoder.decode(Buffer.concat(stdout)); err = decoder.decode(Buffer.concat(stderr)); } catch { reject(new GitBoundaryError("GIT_OUTPUT_INVALID", "Git returned malformed process output")); return; } if (out.includes("\0") || err.includes("\0")) { reject(new GitBoundaryError("GIT_OUTPUT_INVALID", "Git returned malformed process output")); return; } if (code !== 0) { reject(new GitBoundaryError(failureCode(err), failureCode(err) === "GIT_UNSAFE_REPOSITORY" ? "Repository ownership is not trusted; configure Git trust outside this extension" : err)); return; } resolvePromise({ stdout: out, stderr: err }); });
    const timer = setTimeout(() => { child.kill(); finishError(new GitBoundaryError("GIT_TIMEOUT", "Git process exceeded its bounded execution time")); }, options.timeoutMs);
  });
}
async function nearestMarker(cwd: string) { let cursor: string; try { cursor = await realpath(cwd); } catch { throw new GitBoundaryError("GIT_REPOSITORY_UNAVAILABLE", "Working directory is unavailable"); } while (true) { try { await stat(join(cursor, ".git")); return cursor; } catch {} const parent = dirname(cursor); if (parent === cursor) throw new GitBoundaryError("GIT_REPOSITORY_UNAVAILABLE", "No Git repository was found"); cursor = parent; } }
async function confined(root: string, path: string) {
  const absolute = resolve(root, ...path.split("/")); const lexical = relative(root, absolute); if (lexical.startsWith(`..${sep}`) || lexical === ".." || parse(lexical).root) throw new GitBoundaryError("GIT_INPUT_INVALID", "Path escapes the repository");
  let cursor = absolute; while (true) { try { const canonical = await realpath(cursor); const rel = relative(root, canonical); if (rel === ".." || rel.startsWith(`..${sep}`) || parse(rel).root) throw new GitBoundaryError("GIT_INPUT_INVALID", "Path resolves outside the repository"); return; } catch (error) { if (error instanceof GitBoundaryError) throw error; const parent = dirname(cursor); if (parent === cursor) throw new GitBoundaryError("GIT_INPUT_INVALID", "Path boundary could not be established"); cursor = parent; } }
}
export type GitBoundary = Awaited<ReturnType<typeof createGitBoundary>>;

export async function createGitBoundary(cwd: string, supplied: BoundaryOptions = {}) {
  const options = { timeoutMs: supplied.timeoutMs ?? DEFAULT_TIMEOUT, maxOutputBytes: supplied.maxOutputBytes ?? DEFAULT_OUTPUT };
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || !Number.isInteger(options.maxOutputBytes) || options.maxOutputBytes < 1) throw new GitBoundaryError("GIT_INPUT_INVALID", "Invalid process bounds");
  const marker = await nearestMarker(cwd); const probe = await invoke(marker, ["rev-parse", "--show-toplevel"], options); const line = probe.stdout.trim();
  if (!line || line.includes("\n") || !isAbsolute(line)) throw new GitBoundaryError("GIT_OUTPUT_INVALID", "Git returned an invalid repository root");
  const root = await realpath(line); const markerRelative = relative(root, marker); if (markerRelative === ".." || markerRelative.startsWith(`..${sep}`)) throw new GitBoundaryError("GIT_OUTPUT_INVALID", "Git repository root did not contain the discovered working directory");
  const requireCommit = (commit: string) => { if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new GitBoundaryError("GIT_INPUT_INVALID", "Diff base must be a resolved commit identity"); };
  return {
    root,
    async resolveCommit(fixedPoint: string) { const fixed = validateFixedPoint(fixedPoint); const result = await invoke(root, ["rev-parse", "--verify", "--end-of-options", `${fixed}^{commit}`], options); const commit = result.stdout.trim(); if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new GitBoundaryError("GIT_OUTPUT_INVALID", "Git returned an invalid commit identity"); return commit; },
    async head() { try { return await this.resolveCommit("HEAD"); } catch (error) { if (error instanceof GitBoundaryError && error.code === "GIT_PROCESS_FAILED") return undefined; throw error; } },
    async emptyTree() { const result = await invoke(root, ["hash-object", "-t", "tree", "--stdin"], options); const commit = result.stdout.trim(); if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new GitBoundaryError("GIT_OUTPUT_INVALID", "Git returned an invalid empty-tree identity"); return commit; },
    async mergeBase(left: string, right: string) { requireCommit(left); requireCommit(right); try { const result = await invoke(root, ["merge-base", left, right], options); const commit = result.stdout.trim(); requireCommit(commit); return commit; } catch (error) { if (error instanceof GitBoundaryError && error.code === "GIT_PROCESS_FAILED") throw new GitBoundaryError("GIT_HISTORY_INCOMPLETE", "No merge base is available; repository history may be incomplete"); throw error; } },
    async commitSummary(fixed: string, head: string) { requireCommit(fixed); requireCommit(head); return invoke(root, ["log", "--no-show-signature", "--format=%H%x09%s", `${fixed}..${head}`, "--"], options); },
    async nameStatus(baseCommit: string) { requireCommit(baseCommit); return invoke(root, ["diff", "--name-status", "--find-renames", baseCommit, "--"], options); },
    async numstat(baseCommit: string) { requireCommit(baseCommit); return invoke(root, ["diff", "--numstat", "--find-renames", baseCommit, "--"], options); },
    async untracked() { return invoke(root, ["ls-files", "--others", "--exclude-standard"], options); },
    async diff(baseCommit: string, paths?: string | string[]) { requireCommit(baseCommit); const args = ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--find-renames", "--unified=3", baseCommit, "--"]; for (const path of typeof paths === "string" ? [paths] : paths ?? []) { const literal = validateLiteralPath(path); await confined(root, literal); args.push(literal); } return invoke(root, args, options); },
  };
}
