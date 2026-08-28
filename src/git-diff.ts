import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGitBoundary, type GitBoundary, validateLiteralPath } from "./git-boundary.ts";

const PATCH_LIMIT = 64 * 1024;
const METADATA_LIMIT = 16 * 1024;
const CONTENT_LIMIT = 80 * 1024;
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
const lines = (value: string) => value.split("\n").filter(Boolean);
const sort = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export type GitDiffInput = { comparison: "working_tree"; path?: string } | { comparison: "since"; fixedPoint: string; path?: string };
export type GitDiffDetails = {
  comparison: GitDiffInput["comparison"];
  resolvedBase: string;
  observedHead: string;
  resolvedFixedPoint?: string;
  changedFiles: number;
  untrackedFiles: number;
  patchIncluded: boolean;
  patchBytes: number;
  patchTruncated: boolean;
  retainedPatchBytes: number;
  omittedManifestEntries: number;
  omittedCommitEntries: number;
};

type Entry = { rendered: string; paths: string[]; untracked: boolean };
function within(path: string, selected: string) { return path === selected || path.startsWith(`${selected}/`); }
function validPrefix(value: string, limit: number) {
  const data = Buffer.from(value, "utf8");
  if (data.length <= limit) return value;
  let end = limit;
  while (end && (data[end]! & 0xc0) === 0x80) end--;
  return data.subarray(0, end).toString("utf8");
}
function boundedMetadata(header: string[], commits: string[], entries: string[], limit = METADATA_LIMIT) {
  const retainedCommits: string[] = [];
  const retainedEntries: string[] = [];
  const build = (omittedCommits: number, omittedEntries: number) => [
    ...header,
    "Commit summary:",
    ...(retainedCommits.length ? retainedCommits : ["(empty)"]),
    ...(omittedCommits ? [`... ${omittedCommits} commit entries omitted.`] : []),
    "Changed files:",
    ...retainedEntries,
    ...(omittedEntries ? [`... ${omittedEntries} changed file entries omitted.`] : []),
  ].join("\n");
  for (const commit of commits) {
    retainedCommits.push(commit);
    if (bytes(build(commits.length - retainedCommits.length, entries.length)) > limit) { retainedCommits.pop(); break; }
  }
  for (const entry of entries) {
    retainedEntries.push(entry);
    if (bytes(build(commits.length - retainedCommits.length, entries.length - retainedEntries.length)) > limit) { retainedEntries.pop(); break; }
  }
  while (bytes(build(commits.length - retainedCommits.length, entries.length - retainedEntries.length)) > limit && (retainedEntries.length || retainedCommits.length)) {
    if (retainedEntries.length) retainedEntries.pop(); else retainedCommits.pop();
  }
  return { text: build(commits.length - retainedCommits.length, entries.length - retainedEntries.length), omittedCommits: commits.length - retainedCommits.length, omittedEntries: entries.length - retainedEntries.length };
}

export async function renderGitDiff(boundary: GitBoundary, input: GitDiffInput): Promise<{ content: string; details: GitDiffDetails }> {
  const selected = input.path === undefined ? undefined : validateLiteralPath(input.path);
  const observed = await boundary.head();
  if (input.comparison === "since" && !observed) throw new Error("[GIT_HISTORY_INCOMPLETE] Fixed-point comparison requires an existing HEAD");
  const fixed = input.comparison === "since" ? await boundary.resolveCommit(input.fixedPoint) : undefined;
  const base = input.comparison === "since" ? await boundary.mergeBase(fixed!, observed!) : observed ?? await boundary.emptyTree();
  const summary = input.comparison === "since" ? lines((await boundary.commitSummary(fixed!, observed!)).stdout) : [];
  const [names, numbers, untracked] = await Promise.all([boundary.nameStatus(base), boundary.numstat(base), boundary.untracked()]);
  const numberLines = lines(numbers.stdout);
  const tracked: Entry[] = lines(names.stdout).map((line, index) => {
    const [status = "?", ...paths] = line.split("\t");
    const numberParts = (numberLines[index] ?? "").split("\t");
    const counts = `${numberParts[0] ?? "?"}/${numberParts[1] ?? "?"}`;
    return { rendered: `${status}\t${counts}${counts === "-/-" ? " binary" : ""}\t${paths.join(" -> ")}`, paths, untracked: false };
  });
  const other: Entry[] = lines(untracked.stdout).map((path) => ({ rendered: `??\t0/0\tuntracked\t${path}`, paths: [path], untracked: true }));
  const all = [...tracked, ...other].sort((a, b) => sort(a.rendered, b.rendered));
  const chosen = selected ? all.filter((entry) => entry.paths.some((path) => within(path, selected))) : all;
  const patchPaths = selected ? [...new Set(chosen.flatMap((entry) => entry.paths))].sort(sort) : undefined;
  const patch = (await boundary.diff(base, patchPaths)).stdout;
  const header = [
    input.comparison === "since" ? `Comparison: since ${input.fixedPoint}` : "Comparison: working tree from HEAD",
    `Resolved base: ${base}`,
    `Observed HEAD: ${observed ?? "unborn"}`,
    ...(fixed ? [`Resolved fixed point: ${fixed}`] : []),
    ...(selected ? [`Path: ${selected}`] : []),
    "Repository evidence is invocation-local; no snapshot or continuation is retained.",
  ];
  if (!chosen.length) {
    const metadata = boundedMetadata(header, summary, []);
    const content = `${metadata.text}\nNo changes.`;
    return { content, details: { comparison: input.comparison, resolvedBase: base, observedHead: observed ?? "unborn", ...(fixed ? { resolvedFixedPoint: fixed } : {}), changedFiles: 0, untrackedFiles: 0, patchIncluded: true, patchBytes: 0, patchTruncated: false, retainedPatchBytes: 0, omittedManifestEntries: 0, omittedCommitEntries: metadata.omittedCommits } };
  }
  const patchBytes = bytes(patch);
  const aggregate = selected === undefined;
  const patchIncluded = !aggregate || patchBytes <= PATCH_LIMIT;
  const retained = patchIncluded ? validPrefix(patch, PATCH_LIMIT) : "";
  const patchTruncated = selected !== undefined && patchBytes > PATCH_LIMIT;
  const untrackedCaveat = chosen.some((entry) => entry.untracked) ? "\nUntracked file content is not represented in the raw patch; that evidence is incomplete." : "";
  const patchText = !patchIncluded
    ? "\n\nRaw patch omitted because it exceeds 65536 UTF-8 bytes. Request individual literal paths for bounded patch evidence." + untrackedCaveat
    : `\n\nRaw patch${patchTruncated ? ` (truncated: retained ${bytes(retained)} of ${patchBytes} UTF-8 bytes; evidence is incomplete)` : ""}:\n${retained}${untrackedCaveat}`;
  const metadataLimit = Math.min(METADATA_LIMIT, CONTENT_LIMIT - bytes(patchText));
  const metadata = boundedMetadata(header, summary, chosen.map((entry) => entry.rendered), metadataLimit);
  const content = metadata.text + patchText;
  if (bytes(content) > CONTENT_LIMIT) throw new Error("[GIT_OUTPUT_OVERFLOW] Rendered Git evidence exceeded its bounded content budget");
  return { content, details: { comparison: input.comparison, resolvedBase: base, observedHead: observed ?? "unborn", ...(fixed ? { resolvedFixedPoint: fixed } : {}), changedFiles: chosen.filter((entry) => !entry.untracked).length, untrackedFiles: chosen.filter((entry) => entry.untracked).length, patchIncluded, patchBytes, patchTruncated, retainedPatchBytes: bytes(retained), omittedManifestEntries: metadata.omittedEntries, omittedCommitEntries: metadata.omittedCommits } };
}

export const renderWorkingTree = (boundary: GitBoundary) => renderGitDiff(boundary, { comparison: "working_tree" });

export function createGitDiffTool(boundary: GitBoundary): ToolDefinition {
  const path = Type.Optional(Type.String());
  return {
    name: "git_diff",
    label: "Git Diff",
    description: "Inspect invocation-local Git evidence from HEAD or a fixed point. Includes a bounded manifest and commit summary; aggregate or path patch evidence may be incomplete.",
    parameters: Type.Union([
      Type.Object({ comparison: Type.Literal("working_tree"), path }, { additionalProperties: false }),
      Type.Object({ comparison: Type.Literal("since"), fixedPoint: Type.String(), path }, { additionalProperties: false }),
    ]),
    async execute(_id, input) {
      const rendered = await renderGitDiff(boundary, input as GitDiffInput);
      return { content: [{ type: "text" as const, text: rendered.content }], details: rendered.details };
    },
  };
}

export const prepareGitDiff = (cwd: string) => createGitBoundary(cwd, { maxOutputBytes: 8 * 1024 * 1024 });
