import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";
import { allocateTerminalEnvelope } from "../src/projection.ts";

const id = "d_00000000-0000-4000-8000-000000000000";
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitUntil = async (predicate: () => boolean) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } throw new Error("condition not reached"); };

function fixture(faults: { projection?: number; oversized?: number; append?: number; notify?: number; activation?: number } = {}) {
  const tools = new Map<string, any>(); const entries: Array<{ type: string; value: unknown }> = []; const messages: Array<{ message: any; options: any }> = []; const active = ["delegate", "foreign"];
  let projectionCalls = 0; let childRuns = 0;
  const pi = {
    registerTool(tool: any) { tools.set(tool.name, tool); }, on() {}, getActiveTools: () => [...active],
    setActiveTools(value: string[]) { if ((faults.activation ?? 0) > 0) { faults.activation!--; throw new Error("activation"); } active.splice(0, active.length, ...value); },
    appendEntry(type: string, value: unknown) { if (type.endsWith(":terminal") && (faults.append ?? 0) > 0) { faults.append!--; throw new Error("disk"); } entries.push({ type, value }); },
    sendMessage(message: any, options: any) { if ((faults.notify ?? 0) > 0) { faults.notify!--; throw new Error("notify"); } messages.push({ message, options }); },
  };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", runtime: {
    id: () => id, now: () => new Date("2026-01-02T03:04:05.000Z"), loadAgent: async () => "agent",
    projectTerminalEnvelope(base, outcomes) { projectionCalls++; if ((faults.projection ?? 0) > 0) { faults.projection!--; throw new Error("projection"); } const envelope = allocateTerminalEnvelope(base, outcomes); if ((faults.oversized ?? 0) > 0) { faults.oversized!--; return { ...envelope, children: [{ ...envelope.children[0]!, result: "x".repeat(33 * 1024) }] }; } return envelope; },
    createModelRuntime: async () => ({ getModel: () => ({ provider: "p", id: "m", reasoning: true }), getAvailable: async () => [{ provider: "p", id: "m" }] }) as never,
    createChild: async () => { childRuns++; let listener = (_event: any) => {}; const child = { messages: [] as any[], subscribe(fn: any) { listener = fn; return () => {}; }, async prompt() { listener({ type: "agent_start" }); child.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "immutable" }] }); }, async abort() {}, dispose() {} }; return child; },
  } })(pi as never);
  const ctx = { cwd: "/repo", model: { provider: "p", id: "m" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true } };
  const launch = () => tools.get("delegate").execute("x", { mode: "single", task: { agent: "investigation", task: "work" } }, new AbortController().signal, undefined, ctx);
  const inspect = async () => JSON.parse((await tools.get("delegation_control").execute("x", { action: "inspect", delegationId: id })).content[0].text);
  return { launch, inspect, entries, messages, active, childRuns: () => childRuns, projectionCalls: () => projectionCalls };
}

test("projection and append faults remain finalizing and inspect retries immutable work in order", async () => {
  const f = fixture({ projection: 1, append: 1 }); await f.launch(); await waitUntil(() => f.projectionCalls() === 1);
  let result = await f.inspect(); expect(result.phase).toBe("finalizing"); expect(result.diagnostics.map((x: any) => x.code)).toContain("TERMINAL_PERSIST_FAILED");
  result = await f.inspect(); expect(result.envelope.children[0].result).toBe("immutable");
  expect(f.childRuns()).toBe(1); expect(f.projectionCalls()).toBe(2); expect(f.entries.filter((x) => x.type.endsWith(":terminal"))).toHaveLength(1); expect(f.messages).toHaveLength(1);
});

test("oversized construction is rejected and retried without persistence", async () => {
  const f = fixture({ oversized: 1 }); await f.launch(); await waitUntil(() => f.projectionCalls() === 1); expect(f.entries).toHaveLength(0);
  const live = await f.inspect(); expect(live.envelope.children[0].result).toBe("immutable");
  expect(f.projectionCalls()).toBe(2); expect(f.entries.filter((x) => x.type.endsWith(":terminal"))).toHaveLength(1);
});

test("notification and activation faults leave persisted result terminal and notification is not retried", async () => {
  const f = fixture({ notify: 1, activation: 1 }); await f.launch(); await waitUntil(() => f.entries.some((x) => x.type.endsWith(":terminal")));
  const result = await f.inspect(); expect(result.envelope.outcome).toBe("succeeded"); expect(result.diagnostics.map((x: any) => x.code)).toContain("COMPLETION_NOTIFY_FAILED");
  await f.inspect(); expect(f.entries.filter((x) => x.type.endsWith(":terminal"))).toHaveLength(1); expect(f.messages).toHaveLength(0); expect(f.active).toContain("foreign");
});

test("diagnostics are UTF-8 bounded, deterministically deduplicated, and newest eight are retained", async () => {
  const f = fixture({ append: 10 }); await f.launch(); await waitUntil(() => f.projectionCalls() === 1);
  for (let i = 0; i < 10; i++) await f.inspect(); const result = await f.inspect();
  expect(result.diagnostics.filter((x: any) => x.code === "TERMINAL_PERSIST_FAILED")).toHaveLength(1);
  expect(result.diagnostics.every((x: any) => Buffer.byteLength(x.message, "utf8") <= 512)).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(result.diagnostics), "utf8")).toBeLessThanOrEqual(4096);
});
