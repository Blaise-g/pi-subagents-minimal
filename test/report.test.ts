import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReportWriter, validateReportPath, verifyReport } from "../src/report.ts";

const roots: string[] = [];
const project = async () => { const root = await mkdtemp(join(tmpdir(), "pi-report-")); roots.push(root); return root; };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const call = (tool: ReturnType<typeof createReportWriter>, content: string) => tool.execute("call", { content } as never, undefined, undefined, {} as never);

describe("declared report boundary", () => {
  test.each(["", "artifacts//x.md", "artifacts/./x.md", "artifacts/../x.md", "artifacts/x.MD", "artifacts\\x.md", "/artifacts/x.md", "C:/artifacts/x.md", "//host/artifacts/x.md", "\\\\?\\C:\\artifacts\\x.md"])("rejects non-portable path %s", async (declared) => {
    const root = await project();
    await expect(validateReportPath(root, declared)).rejects.toThrow("[REPORT_PATH_INVALID]");
  });

  test("creates and atomically replaces exactly the declared UTF-8 Markdown file", async () => {
    const root = await project();
    await mkdir(join(root, "artifacts"));
    await writeFile(join(root, "artifacts", "report.md"), "old");
    const state = { written: false, failed: false };
    const tool = createReportWriter(root, "artifacts/report.md", state, () => {});
    const result = await call(tool, "# Evidence\n🙂\n");
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({ path: "artifacts/report.md", bytesWritten: 16 });
    expect(await readFile(join(root, "artifacts", "report.md"), "utf8")).toBe("# Evidence\n🙂\n");
    expect(await verifyReport(root, "artifacts/report.md")).toBeTrue();
    await expect(call(tool, "again")).rejects.toThrow("[REPORT_ALREADY_WRITTEN]");
  });

  test("permits a retry after invalid content and leaves no temporary residue", async () => {
    const root = await project();
    const state = { written: false, failed: false };
    const tool = createReportWriter(root, "artifacts/nested/report.md", state, () => {});
    await expect(call(tool, "")).rejects.toThrow("[REPORT_WRITE_FAILED]");
    await call(tool, "valid");
    expect(await readFile(join(root, "artifacts", "nested", "report.md"), "utf8")).toBe("valid");
    expect((await import("node:fs/promises")).readdir(join(root, "artifacts", "nested"))).resolves.toEqual(["report.md"]);
  });

  test("rejects canonical ancestors and targets that use filesystem indirection", async () => {
    const root = await project();
    const outside = await project();
    await mkdir(join(root, "artifacts"));
    await symlink(outside, join(root, "artifacts", "escape"), "dir");
    await expect(validateReportPath(root, "artifacts/escape/report.md")).rejects.toThrow("[REPORT_PATH_INVALID]");
    await symlink(join(outside, "report.md"), join(root, "artifacts", "target.md"));
    await expect(validateReportPath(root, "artifacts/target.md")).rejects.toThrow("[REPORT_PATH_INVALID]");
  });

  test("fails closed if an ancestor is replaced by a symlink before writing", async () => {
    const root = await project();
    const outside = await project();
    await mkdir(join(root, "artifacts", "nested"), { recursive: true });
    await validateReportPath(root, "artifacts/nested/report.md");
    await rm(join(root, "artifacts", "nested"), { recursive: true });
    await symlink(outside, join(root, "artifacts", "nested"), "dir");
    const tool = createReportWriter(root, "artifacts/nested/report.md", { written: false, failed: false }, () => {});
    await expect(call(tool, "must not escape")).rejects.toThrow("[REPORT_WRITE_FAILED]");
    await expect(readFile(join(outside, "report.md"), "utf8")).rejects.toThrow();
  });
});
