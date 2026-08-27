import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { withFileMutationQueue, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const MAX_REPORT_BYTES = 1024 * 1024;
const portableAbsolute = /^(?:[A-Za-z]:[\\/]|[\\/]{2}|\\\\[?.]\\|\/)/;
const reportPattern = /^artifacts\/(?:[^/]+\/)*[^/]+\.md$/;
const bytes = (value: string) => Buffer.byteLength(value, "utf8");
const reportError = (code: string, message: string): never => { throw new Error(`[${code}] ${message}`); };
const inside = (root: string, candidate: string) => {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
};

export type ValidatedReportPath = Readonly<{ declared: string; root: string; target: string }>;

/** Validate syntax and every currently existing filesystem component without following indirection. */
export async function validateReportPath(cwd: string, declared: string): Promise<ValidatedReportPath> {
  if (bytes(declared) < 1 || bytes(declared) > 1024 || declared.includes("\\") || portableAbsolute.test(declared)
    || !reportPattern.test(declared) || declared.split("/").some((part) => part === "" || part === "." || part === "..")) {
    reportError("REPORT_PATH_INVALID", "reportPath must be a normalized Markdown path beneath artifacts/");
  }
  let canonicalCwd: string;
  try { canonicalCwd = await realpath(cwd); } catch { return reportError("REPORT_PATH_INVALID", "The project root cannot be safely resolved"); }
  const root = resolve(canonicalCwd, "artifacts");
  const target = resolve(canonicalCwd, ...declared.split("/"));
  if (!inside(root, target)) reportError("REPORT_PATH_INVALID", "reportPath escapes the report root");

  let cursor = canonicalCwd;
  for (const segment of declared.split("/")) {
    cursor = resolve(cursor, segment);
    try {
      const status = await lstat(cursor);
      if (status.isSymbolicLink() || (!status.isDirectory() && cursor !== target) || (cursor === target && !status.isFile())) {
        reportError("REPORT_PATH_INVALID", "reportPath contains unsafe filesystem indirection or type");
      }
      const canonical = await realpath(cursor);
      if (!inside(root, canonical) && canonical !== root) reportError("REPORT_PATH_INVALID", "reportPath resolves outside the report root");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      if (error instanceof Error && error.message.includes("[REPORT_PATH_INVALID]")) throw error;
      reportError("REPORT_PATH_INVALID", "reportPath cannot be safely resolved");
    }
  }
  return Object.freeze({ declared, root, target });
}

export type ReportState = { written: boolean; failed: boolean };

export function createReportWriter(
  cwd: string,
  declared: string,
  state: ReportState,
  diagnostic: (code: "REPORT_TEMP_CLEANUP_FAILED", message: string) => void,
): ToolDefinition {
  return {
    name: "write_report",
    label: "Write Report",
    description: "Create or replace the one declared Markdown report. The destination is fixed by the host.",
    parameters: Type.Object({ content: Type.String() }, { additionalProperties: false }),
    async execute(_id, input: { content: string }): Promise<{ content: Array<{ type: "text"; text: string }>; details: {} }> {
      if (state.written) reportError("REPORT_ALREADY_WRITTEN", "The declared report was already written");
      const contentBytes = bytes(input.content);
      if (contentBytes < 1 || contentBytes > MAX_REPORT_BYTES) {
        state.failed = true;
        reportError("REPORT_WRITE_FAILED", "Report content must be 1..1048576 UTF-8 bytes");
      }
      let validated: ValidatedReportPath;
      try { validated = await validateReportPath(cwd, declared); }
      catch { state.failed = true; return reportError("REPORT_WRITE_FAILED", "The declared report path is no longer safe"); }
      return withFileMutationQueue<{ content: Array<{ type: "text"; text: string }>; details: {} }>(validated.target, async () => {
        let temporary: string | undefined;
        try {
          await mkdir(dirname(validated.target), { recursive: true });
          validated = await validateReportPath(cwd, declared);
          temporary = resolve(dirname(validated.target), `.pi-report-${randomUUID()}.tmp`);
          const handle = await open(temporary, "wx", 0o600);
          try { await handle.writeFile(input.content, { encoding: "utf8" }); await handle.sync(); }
          finally { await handle.close(); }
          await validateReportPath(cwd, declared);
          await rename(temporary, validated.target);
          temporary = undefined;
          const final = await validateReportPath(cwd, declared);
          const persisted = await readFile(final.target);
          if (persisted.byteLength !== contentBytes) reportError("REPORT_WRITE_FAILED", "Report replacement could not be verified");
          state.written = true;
          return { content: [{ type: "text" as const, text: JSON.stringify({ path: declared, bytesWritten: contentBytes }) }], details: {} };
        } catch (error) {
          state.failed = true;
          if (error instanceof Error && error.message.includes("[REPORT_WRITE_FAILED]")) throw error;
          return reportError("REPORT_WRITE_FAILED", "The report could not be atomically replaced");
        } finally {
          if (temporary) {
            try { await rm(temporary, { force: true }); }
            catch { diagnostic("REPORT_TEMP_CLEANUP_FAILED", "Temporary report cleanup failed"); }
          }
        }
      });
    },
  };
}

export async function verifyReport(cwd: string, declared: string): Promise<boolean> {
  try {
    const path = await validateReportPath(cwd, declared);
    return (await lstat(path.target)).isFile();
  } catch { return false; }
}
