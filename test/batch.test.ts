import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitUntil = async (predicate: () => boolean) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } throw new Error("condition not reached"); };

function fixture(concurrency = 2, queueTimeoutMs?: number) {
  const tools = new Map<string, any>(); const entries: any[] = []; const pending: Array<{ task: string; child: any; resolve: () => void }> = []; let ids = 0; let active = 0; let maximum = 0;
  const pi = { registerTool(tool: any) { tools.set(tool.name, tool); }, on() {}, getActiveTools: () => ["delegate"], setActiveTools() {}, appendEntry(type: string, value: unknown) { entries.push({ type, value }); }, sendMessage() {} };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", env: { PI_SUBAGENTS_MINIMAL_CONCURRENCY: String(concurrency), ...(queueTimeoutMs ? { PI_SUBAGENTS_MINIMAL_QUEUE_TIMEOUT_MS: String(queueTimeoutMs) } : {}) }, runtime: {
    id: () => `d_${++ids}`, now: () => new Date("2026-01-02T03:04:05.000Z"), loadAgent: async () => "agent",
    createModelRuntime: async () => ({ getModel: () => ({ provider: "p", id: "m", reasoning: true }), getAvailable: async () => [{ provider: "p", id: "m" }] }) as never,
    createChild: async (request) => { active++; maximum = Math.max(maximum, active); let listener = (_event: any) => {}; let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); const child = { messages: [] as any[], subscribe(fn: any) { listener = fn; return () => {}; }, async prompt() { listener({ type: "agent_start" }); await promise; }, dispose() { active--; }, async abort() {} }; pending.push({ task: request.task, child, resolve }); return child; },
  } })(pi as never);
  const ctx = { cwd: "/repo", model: { provider: "p", id: "m" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true } };
  const execute = (tasks: string[]) => tools.get("delegate").execute("x", { mode: "batch", tasks: tasks.map((task) => ({ agent: "investigation", task })) }, new AbortController().signal, undefined, ctx);
  const complete = (task: string, text = task, stopReason = "stop") => { const item = pending.find((x) => x.task === task)!; item.child.messages.push({ role: "assistant", stopReason, content: [{ type: "text", text }] }); item.resolve(); };
  return { execute, complete, pending, entries, tools, ctx, maximum };
}

test("flat batch is all-settled and returns input order after reverse completion", async () => {
  const f = fixture(2); const accepted = await f.execute(["A", "B", "C"]); expect(JSON.parse(accepted.content[0].text).taskCount).toBe(3);
  await waitUntil(() => f.pending.length === 2); f.complete("B", "useful B", "length"); await waitUntil(() => f.pending.some((x) => x.task === "C")); f.complete("C", "answer C"); f.complete("A", "answer A");
  await waitUntil(() => f.entries.some((x) => x.type.endsWith(":terminal"))); const envelope = f.entries.find((x) => x.type.endsWith(":terminal")).value;
  expect(envelope.outcome).toBe("partial"); expect(envelope.children.map((x: any) => [x.index, x.outcome])).toEqual([[0, "succeeded"], [1, "failed"], [2, "succeeded"]]); expect(envelope.children[1].partialResult).toBe("useful B");
});

test("one extension-wide FIFO spans Delegations and never exceeds capacity", async () => {
  const f = fixture(1); await f.execute(["A1", "A2"]); await f.execute(["B1", "B2"]); await waitUntil(() => f.pending.length === 1); expect(f.pending.map((x) => x.task)).toEqual(["A1"]);
  f.complete("A1"); await waitUntil(() => f.pending.length === 2); expect(f.pending[1].task).toBe("A2"); f.complete("A2"); await waitUntil(() => f.pending.length === 3); expect(f.pending[2].task).toBe("B1"); f.complete("B1"); await waitUntil(() => f.pending.length === 4); f.complete("B2");
  await waitUntil(() => f.entries.filter((x) => x.type.endsWith(":terminal")).length === 2);
});

test("queue timeout settles only the waiting child and does not cancel its sibling", async () => {
  const f = fixture(1, 1000); await f.execute(["running", "waiting"]); await waitUntil(() => f.pending.length === 1); await new Promise((resolve) => setTimeout(resolve, 1010));
  expect(f.pending.map((x) => x.task)).toEqual(["running"]); f.complete("running"); await waitUntil(() => f.entries.some((x) => x.type.endsWith(":terminal"))); const envelope = f.entries.find((x) => x.type.endsWith(":terminal")).value;
  expect(envelope.outcome).toBe("partial"); expect(envelope.children[1]).toMatchObject({ outcome: "timed_out", error: { stage: "queue", code: "QUEUE_TIMEOUT" } });
});

test("batch preflight rejects invalid size and total bytes before admission", async () => {
  const f = fixture(); await expect(f.execute(["only"])).rejects.toThrow("[BATCH_SIZE_INVALID]"); await expect(f.execute(["x".repeat(16384), "x".repeat(16384), "x".repeat(16384), "x".repeat(16384), "x"])).rejects.toThrow("[INPUT_INVALID]"); expect(f.pending).toHaveLength(0);
});
