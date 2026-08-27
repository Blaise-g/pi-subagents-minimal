import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildPlan, type TrialPlan } from "../tools/behavioral-battery.ts";
import { deterministicErrors, finalizeRecords } from "../tools/behavioral-runner.ts";
import { observeChild } from "../tools/behavioral-observer-extension.ts";

const manifest = JSON.parse(readFileSync(new URL("./behavioral/fixtures/manifest.json", import.meta.url), "utf8"));
const oracles = JSON.parse(readFileSync(new URL("./behavioral/oracles/v1.json", import.meta.url), "utf8"));
const plan = buildPlan(manifest);

function execution(trial: TrialPlan, answer: string, taskOverrides: Record<string, unknown> = {}) {
  const task = { agent: "investigation", task: trial.prompt, ...taskOverrides };
  const args = trial.children === 1 ? { mode: "single", task } : { mode: "batch", tasks: Array.from({ length: trial.children }, () => task) };
  const events = [
    { type: "agent_start" },
    { type: "tool_execution_start", toolName: "delegate", args },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: answer }], usage: { input: 1, output: 1 } } },
    { type: "agent_end", messages: [{ role: "user", content: [{ type: "text", text: trial.prompt }] }] },
    ...Array.from({ length: trial.children }, (_, childIndex) => [
      { batterySource: "child", childIndex, event: { type: "agent_start" } },
      { batterySource: "child", childIndex, event: { type: "agent_end" } },
    ]).flat(),
  ];
  const envelope = {
    schemaVersion: 1, delegationId: "d_00000000-0000-4000-8000-000000000000", outcome: "succeeded", completedAt: "2026-01-01T00:00:00.000Z", taskCount: trial.children, order: "input",
    children: Array.from({ length: trial.children }, (_, index) => trial.scenario === "research"
      ? { index, outcome: "succeeded", effectiveModel: "openai-codex/gpt-5.6-luna", effectiveThinking: trial.thinking, report: { path: "artifacts/session-isolation.md", summary: "evidence" } }
      : { index, outcome: "succeeded", effectiveModel: "openai-codex/gpt-5.6-luna", effectiveThinking: trial.thinking, result: "evidence" }),
  };
  return { events, envelope };
}

describe("provider-backed Behavioral runner", () => {
  test("observes through the runtime subscription without adding a second child subscriber", () => {
    let subscriptions = 0;
    const child = {
      messages: [], prompt: async () => {}, dispose: () => {}, abort: async () => {},
      subscribe(listener: (event: { type: string }) => void) { subscriptions++; listener({ type: "agent_start" }); return () => {}; },
    };
    const sink: any[] = [];
    const observed = observeChild(child, 2, sink);
    let forwarded = "";
    observed.subscribe((event) => { forwarded = event.type; });
    expect(subscriptions).toBe(1);
    expect(forwarded).toBe("agent_start");
    expect(sink).toEqual([{ batterySource: "child", childIndex: 2, event: { type: "agent_start" } }]);
  });

  test("deterministically accepts a read-only bounded exploration workflow", () => {
    const trial = plan.find(({ id }) => id === "exploration--low--1")!;
    const { events, envelope } = execution(trial, "`resource-loader.js` `DefaultResourceLoader.loadSkills()` calls `mergePaths`; discovered paths precede additional paths.");
    expect(deterministicErrors(trial, events, envelope, "", "", {})).toEqual([]);
  });

  test("rejects child-count, tuple, mutation, and ordering drift", () => {
    const trial = plan.find(({ id }) => id === "diff-review--high--1")!;
    const { events, envelope } = execution(trial, "## Spec\nwrong order\n## Standards\nlate");
    envelope.children[0]!.effectiveThinking = "low";
    const errors = deterministicErrors(trial, events, envelope, "", " M src/users.ts", {});
    expect(errors).toContain("invalid effective tuple or outcome for child 0");
    expect(errors).toContain("diff review modified its fixture");
    expect(errors).toContain("diff review did not preserve Standards then Spec aggregation");
  });

  test("requires the declared research report and exact sole mutation", () => {
    const trial = plan.find(({ id }) => id === "research--medium--1")!;
    const { events, envelope } = execution(trial, "Summary: `artifacts/session-isolation.md`", { reportPath: "artifacts/session-isolation.md" });
    expect(deterministicErrors(trial, events, envelope, "", "?? artifacts/session-isolation.md", { "artifacts/session-isolation.md": "Fact (`src/a.ts:10-12`)." })).toEqual([]);
    expect(deterministicErrors(trial, events, envelope, "", "?? artifacts/session-isolation.md\n?? extra.md", { "artifacts/session-isolation.md": "uncited" })).toContain("research made an additional mutation");
  });

  test("requires explicit human decisions and preserves a genuine failed score", () => {
    const trial = plan[0]!;
    const { events, envelope } = execution(trial, "`resource-loader.js` `DefaultResourceLoader.loadSkills()` calls `mergePaths`.");
    const observation = {
      ...trial, fixtureCommit: "a".repeat(40), provider: "openai-codex", model: "gpt-5.6-luna", piVersion: "0.84.3", packageVersion: "1.0.0",
      startedAt: "2026-01-01T00:00:00.000Z", wallTimeMs: 1, eventStream: events, terminalEnvelope: envelope,
      usage: { input: 1, output: 1, total: 2 }, deterministicPassed: true, deterministicErrors: [], capturedFiles: {}, stderr: "",
    };
    const checks = Object.fromEntries(oracles.exploration.map((check: string) => [check, true]));
    checks[oracles.exploration[0]] = false;
    const scorecard = { reviewer: "human@example.test", reviewedAt: "2026-01-02T00:00:00.000Z", trials: { [trial.id]: { checks } } };
    const records = finalizeRecords([trial], [observation] as any, scorecard, oracles);
    expect(records[0]!.humanPassed).toBe(false);
    expect(records[0]!.humanOracle[oracles.exploration[0]]).toBe(false);
    scorecard.trials[trial.id]!.checks[oracles.exploration[0]] = null as any;
    expect(() => finalizeRecords([trial], [observation] as any, scorecard, oracles)).toThrow("incomplete human score");
    scorecard.reviewer = "";
    expect(() => finalizeRecords([trial], [observation] as any, scorecard, oracles)).toThrow("missing human reviewer evidence");
  });
});
