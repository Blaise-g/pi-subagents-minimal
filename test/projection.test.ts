import { expect, test } from "bun:test";
import { allocateTerminalEnvelope, terminalEnvelopeFeasible, type ChildOutcome, type TerminalEnvelope } from "../src/projection.ts";

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const base = (children: ChildOutcome[]): Omit<TerminalEnvelope, "children"> => ({
  schemaVersion: 2, delegationId: "d_test", outcome: children.every((child) => child.outcome === "succeeded") ? "succeeded" : "failed",
  completedAt: "2026-01-02T03:04:05.000Z", taskCount: children.length, order: "input",
});

function reference(children: readonly ChildOutcome[]) {
  let winner: TerminalEnvelope | undefined;
  for (let waterline = 0; waterline <= 16 * 1024; waterline++) {
    const projected = children.map((child) => {
      const copy = structuredClone(child);
      const selected = child.result !== undefined ? ["result", child.result, 16 * 1024] as const
        : child.report !== undefined ? ["report.summary", child.report.summary, 16 * 1024] as const
        : child.partialResult !== undefined ? ["partialResult", child.partialResult, 4 * 1024] as const : undefined;
      if (!selected) return copy;
      const [field, original, cap] = selected;
      const limit = Math.min(waterline, cap);
      const source = Buffer.from(original);
      let end = Math.min(limit, source.length);
      while (end > 0 && (source[end]! & 0xc0) === 0x80) end--;
      const retained = source.subarray(0, end).toString();
      if (field === "result") copy.result = retained;
      else if (field === "report.summary") copy.report!.summary = retained;
      else copy.partialResult = retained;
      if (retained !== original) copy.truncation = { field, originalBytes: Buffer.byteLength(original), retainedBytes: Buffer.byteLength(retained) };
      return copy;
    });
    if (projected.some((child) => child.outcome === "succeeded" && child.result !== undefined && child.result === "")) continue;
    const variable = projected.reduce((sum, child) => sum
      + (child.report ? Buffer.byteLength(child.report.path) : 0)
      + Buffer.byteLength(child.result ?? child.report?.summary ?? child.partialResult ?? "")
      + (child.truncation ? bytes(child.truncation) : 0), 0);
    const envelope = { ...base(projected), children: projected } as TerminalEnvelope;
    if (variable <= 24 * 1024 && bytes(envelope) <= 32 * 1024) winner = envelope;
  }
  if (!winner) throw new Error("reference found no legal allocation");
  return winner;
}

test("canonical allocator matches an independent Unicode waterline model", () => {
  for (let seed = 8; seed <= 8; seed++) {
    const text = `${"é".repeat(seed * 500)}${"🙂".repeat(seed * 150)}${"x".repeat(seed * 600)}`;
    const children: ChildOutcome[] = [
      { index: 0, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], result: text },
      { index: 1, outcome: "failed", effectiveModel: "p/m", effectiveThinking: "high", effectiveTools: ["read", "grep", "find", "ls"], partialResult: text, error: { stage: "run", code: "RUN_FAILED", message: "failed" } },
      { index: 2, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "low", effectiveTools: ["read", "grep", "find", "ls"], report: { path: `artifacts/${"界".repeat(seed)}.md`, summary: text } },
    ];
    const expected = reference(children);
    expect(allocateTerminalEnvelope(base(children), children)).toEqual(expected);
    expect(bytes(expected)).toBeLessThanOrEqual(32 * 1024);
  }
});

test("allocation is permutation-independent and protects complete report paths", () => {
  const text = "🙂".repeat(7000);
  const children: ChildOutcome[] = [
    { index: 0, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], result: text },
    { index: 1, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], report: { path: `artifacts/${"é".repeat(400)}.md`, summary: text } },
  ];
  const first = allocateTerminalEnvelope(base(children), children);
  const reversedInput = [...children].reverse().map((child, index) => ({ ...child, index }));
  const reversed = allocateTerminalEnvelope(base(reversedInput), reversedInput);
  expect(first.children.map((child) => Buffer.byteLength(child.result ?? child.report?.summary ?? ""))).toEqual([...reversed.children].reverse().map((child) => Buffer.byteLength(child.result ?? child.report?.summary ?? "")));
  expect(first.children[1]!.report!.path).toBe(children[1]!.report!.path);
  expect(bytes(first)).toBeLessThanOrEqual(32 * 1024);
});

test("individual caps are exact and truncation metadata describes actual retained UTF-8 bytes", () => {
  const children: ChildOutcome[] = [
    { index: 0, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], result: "x".repeat(16 * 1024 + 1) },
    { index: 1, outcome: "failed", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], partialResult: "é".repeat(4 * 1024), error: { stage: "run", code: "RUN_FAILED", message: "failed" } },
  ];
  const envelope = allocateTerminalEnvelope(base(children), children);
  expect(Buffer.byteLength(envelope.children[0]!.result!)).toBe(16 * 1024);
  expect(envelope.children[0]!.truncation).toEqual({ field: "result", originalBytes: 16 * 1024 + 1, retainedBytes: 16 * 1024 });
  expect(Buffer.byteLength(envelope.children[1]!.partialResult!)).toBe(4 * 1024);
  expect(envelope.children[1]!.truncation).toEqual({ field: "partialResult", originalBytes: 8 * 1024, retainedBytes: 4 * 1024 });
});

test("feasibility reserves protected metadata without model output", () => {
  expect(terminalEnvelopeFeasible(base([]), [{ index: 0, outcome: "succeeded", effectiveModel: "p/m", effectiveThinking: "off", effectiveTools: ["read", "grep", "find", "ls"], report: { path: `artifacts/${"x".repeat(25 * 1024)}.md`, summary: "" } }])).toBe(false);
});
