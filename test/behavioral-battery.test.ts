import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPlan, validateRecords, type TrialRecord } from "../tools/behavioral-battery.js";

const manifest = JSON.parse(readFileSync(new URL("./behavioral/fixtures/manifest.json", import.meta.url), "utf8")) as Parameters<typeof buildPlan>[0];
const plan = buildPlan(manifest);

describe("frozen Behavioral battery", () => {
  test("freezes 36 trials and 63 child sessions across exact tuples", () => {
    expect(plan).toHaveLength(36);
    expect(plan.reduce((sum, trial) => sum + trial.children, 0)).toBe(63);
    expect(new Set(plan.map((trial) => trial.thinking))).toEqual(new Set(["low", "medium", "high"]));
    for (const scenario of manifest.scenarios)
      for (const thinking of manifest.model.thinking)
        expect(plan.filter((trial) => trial.scenario === scenario.id && trial.thinking === thinking)).toHaveLength(3);
  });

  test("rejects missing, altered, failed, and substituted trial evidence", () => {
    const records = plan.map((trial): TrialRecord => ({ ...trial, fixtureCommit: "abc", provider: "openai-codex", model: "gpt-5.6-luna", piVersion: "0.84.3", packageVersion: "1.0.0", startedAt: "2026-01-01T00:00:00Z", wallTimeMs: 1, eventStream: [], terminalEnvelope: {}, usage: { input: 1, output: 2, total: 3 }, humanOracle: { grounded: true }, deterministicPassed: true, humanPassed: true }));
    expect(validateRecords(plan, records)).toEqual([]);
    records[0]!.model = "other";
    records[1]!.humanOracle.grounded = false;
    records.pop();
    expect(validateRecords(plan, records).join("\n")).toContain("unsupported tuple");
    expect(validateRecords(plan, records).join("\n")).toContain("failures cannot be waived");
    expect(validateRecords(plan, records).join("\n")).toContain("missing simplification--high--3");
  });

  test("prepares equivalent committed and uncommitted diffs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "battery-"));
    const committed = join(dir, "committed"), uncommitted = join(dir, "uncommitted");
    execFileSync("bash", ["tools/prepare-battery-fixture.sh", committed, "committed"]);
    execFileSync("bash", ["tools/prepare-battery-fixture.sh", uncommitted, "uncommitted"]);
    const committedDiff = execFileSync("git", ["-C", committed, "diff", "battery-base...HEAD", "--", "src/users.ts"], { encoding: "utf8" });
    const uncommittedDiff = execFileSync("git", ["-C", uncommitted, "diff", "--", "src/users.ts"], { encoding: "utf8" });
    expect(committedDiff.replaceAll(committed, "")).toBe(uncommittedDiff.replaceAll(uncommitted, ""));
    expect(await readFile(join(uncommitted, "src/users.ts"), "utf8")).toContain("loadUserSummary");
  });
});
