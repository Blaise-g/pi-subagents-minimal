import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createGitBoundary, type GitBoundary } from "./git-boundary.ts";

const PATCH_LIMIT = 64 * 1024;
const METADATA_LIMIT = 16 * 1024;
const CONTENT_LIMIT = 80 * 1024;
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
const lines = (value: string) => value.split("\n").filter(Boolean);

export type GitDiffDetails = {
  comparison: "working_tree";
  resolvedBase: string;
  observedHead: string;
  changedFiles: number;
  untrackedFiles: number;
  patchIncluded: boolean;
  patchBytes: number;
  omittedManifestEntries: number;
};

function boundedManifest(header: string[], entries: string[]) {
  const retained: string[] = [];
  for (const entry of entries) {
    const candidate = [...header, "Changed files:", ...retained, entry].join("\n") + "\n";
    if (bytes(candidate) > METADATA_LIMIT) break;
    retained.push(entry);
  }
  let omitted = entries.length - retained.length;
  let text = [...header, "Changed files:", ...retained, ...(omitted ? [`... ${omitted} changed file entries omitted.`] : [])].join("\n");
  while (bytes(text) > METADATA_LIMIT && retained.length) {
    retained.pop(); omitted = entries.length - retained.length;
    text = [...header, "Changed files:", ...retained, `... ${omitted} changed file entries omitted.`].join("\n");
  }
  return { text, omitted };
}

export async function renderWorkingTree(boundary: GitBoundary): Promise<{ content: string; details: GitDiffDetails }> {
  const observedHead = await boundary.head();
  const base = observedHead ?? await boundary.emptyTree();
  const [names, numbers, untracked, patch] = await Promise.all([
    boundary.nameStatus(base), boundary.numstat(base), boundary.untracked(), boundary.diff(base),
  ]);
  const numberLines = lines(numbers.stdout);
  const tracked = lines(names.stdout).map((line, index) => {
    const [status = "?", ...paths] = line.split("\t");
    const [added = "?", deleted = "?"] = (numberLines[index] ?? "").split("\t");
    const counts = `${added}/${deleted}`;
    const binary = counts === "-/-" ? " binary" : "";
    return `${status}\t${counts}${binary}\t${paths.join(" -> ")}`;
  });
  const canonicalSort = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const other = lines(untracked.stdout).sort(canonicalSort).map((path) => `??\t0/0\tuntracked\t${path}`);
  const entries = [...tracked, ...other].sort(canonicalSort);
  const header = ["Comparison: working tree from HEAD", `Resolved base: ${base}`, `Observed HEAD: ${observedHead ?? "unborn"}`];
  if (!entries.length) {
    const content = [...header, "No changes."].join("\n");
    return { content, details: { comparison: "working_tree", resolvedBase: base, observedHead: observedHead ?? "unborn", changedFiles: 0, untrackedFiles: 0, patchIncluded: true, patchBytes: 0, omittedManifestEntries: 0 } };
  }
  const manifest = boundedManifest(header, entries);
  const patchBytes = bytes(patch.stdout);
  const patchIncluded = patchBytes <= PATCH_LIMIT;
  const patchText = patchIncluded
    ? `\n\nRaw patch:\n${patch.stdout}`
    : "\n\nRaw patch omitted because it exceeds 65536 UTF-8 bytes. Request individual paths for complete patch evidence.";
  const content = manifest.text + patchText;
  if (bytes(content) > CONTENT_LIMIT) throw new Error("[GIT_OUTPUT_OVERFLOW] Rendered Git evidence exceeded its bounded content budget");
  return { content, details: { comparison: "working_tree", resolvedBase: base, observedHead: observedHead ?? "unborn", changedFiles: tracked.length, untrackedFiles: other.length, patchIncluded, patchBytes, omittedManifestEntries: manifest.omitted } };
}

export function createGitDiffTool(boundary: GitBoundary): ToolDefinition {
  return {
    name: "git_diff",
    label: "Git Diff",
    description: "Inspect staged, unstaged, and non-ignored untracked working-tree changes from HEAD. Aggregate patch evidence may be omitted when too large.",
    parameters: Type.Object({ comparison: Type.Literal("working_tree") }, { additionalProperties: false }),
    async execute() {
      const rendered = await renderWorkingTree(boundary);
      return { content: [{ type: "text" as const, text: rendered.content }], details: rendered.details };
    },
  };
}

export const prepareGitDiff = (cwd: string) => createGitBoundary(cwd, { maxOutputBytes: 8 * 1024 * 1024 });
