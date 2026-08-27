import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildPlan, validateRecords, type TrialRecord } from "../tools/behavioral-battery.js";

const manifest = JSON.parse(readFileSync(new URL("./behavioral/fixtures/manifest.json", import.meta.url), "utf8")) as Parameters<typeof buildPlan>[0];
const oracles = JSON.parse(readFileSync(new URL("./behavioral/oracles/v1.json", import.meta.url), "utf8")) as Record<string, string[] | Record<string, string[]>>;
const plan = buildPlan(manifest);

function passingRecord(trial: (typeof plan)[number]): TrialRecord {
  const configured = oracles[trial.scenario]!;
  const checks = Array.isArray(configured) ? configured : Object.values(configured).flat();
  return {
    ...trial,
    fixtureCommit: "a".repeat(40), provider: "openai-codex", model: "gpt-5.6-luna",
    piVersion: "0.84.3", packageVersion: "1.0.0", startedAt: "2026-01-01T00:00:00.000Z", wallTimeMs: 1,
    eventStream: [
      { type: "agent_start" },
      { type: "agent_end", messages: [{ role: "user", content: [{ type: "text", text: trial.prompt }] }] },
      ...Array.from({ length: trial.children }, (_, childIndex) => [
        { batterySource: "child", childIndex, event: { type: "agent_start" } },
        { batterySource: "child", childIndex, event: { type: "agent_end" } },
      ]).flat(),
    ],
    terminalEnvelope: {
      schemaVersion: 1, delegationId: "d_00000000-0000-4000-8000-000000000000", outcome: "succeeded",
      completedAt: "2026-01-01T00:00:00.001Z", taskCount: trial.children, order: "input",
      children: Array.from({ length: trial.children }, (_, index) => trial.scenario === "research"
        ? { index, outcome: "succeeded", effectiveModel: "openai-codex/gpt-5.6-luna", effectiveThinking: trial.thinking, report: { path: "artifacts/session-isolation.md", summary: "review evidence" } }
        : { index, outcome: "succeeded", effectiveModel: "openai-codex/gpt-5.6-luna", effectiveThinking: trial.thinking, result: "review evidence" }),
    },
    usage: { input: 1, output: 2, total: 3 }, humanOracle: Object.fromEntries(checks.map((check) => [check, true])),
    humanReview: { reviewer: "release-operator", reviewedAt: "2026-01-02T00:00:00.000Z" },
    deterministicPassed: true, humanPassed: true,
  };
}

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
    const records = plan.map(passingRecord);
    expect(validateRecords(plan, records)).toEqual([]);
    records[0]!.model = "other";
    records[1]!.humanOracle.grounded = false;
    records.pop();
    expect(validateRecords(plan, records).join("\n")).toContain("unsupported tuple");
    expect(validateRecords(plan, records).join("\n")).toContain("failures cannot be waived");
    expect(validateRecords(plan, records).join("\n")).toContain("missing simplification--high--3");
  });

  test("rejects placeholder execution evidence and incomplete human scorecards", () => {
    const records = plan.map(passingRecord);
    records[0]!.eventStream = [];
    records[1]!.eventStream = [{ type: "agent_end", messages: [{ role: "user", content: [{ type: "text", text: "altered" }] }] }];
    records[2]!.terminalEnvelope = {};
    records[3]!.usage = { input: 0, output: 0, total: 0 };
    delete records[4]!.humanOracle[Object.keys(records[4]!.humanOracle)[0]!];
    records[5]!.humanReview.reviewer = "";
    const errors = validateRecords(plan, records).join("\n");
    expect(errors).toContain("empty event stream");
    expect(errors).toContain("event stream does not prove exact prompt");
    expect(errors).toContain("incomplete child event streams");
    expect(errors).toContain("invalid Terminal envelope");
    expect(errors).toContain("empty usage");
    expect(errors).toContain("human oracle inventory mismatch");
    expect(errors).toContain("missing human reviewer evidence");
  });

  test("rejects envelopes that do not prove every effective child tuple", () => {
    const records = plan.map(passingRecord);
    const envelope = records[0]!.terminalEnvelope as { children: Array<{ effectiveThinking: string }> };
    envelope.children[0]!.effectiveThinking = "medium";
    expect(validateRecords(plan, records).join("\n")).toContain("invalid Terminal envelope");
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
