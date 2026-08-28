import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const ids = [
  "d_00000000-0000-4000-8000-000000000000",
  "d_00000000-0000-4000-8000-000000000001",
];
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitUntil = async (predicate: () => boolean) => { for (let index = 0; index < 100; index++) { if (predicate()) return; await tick(); } throw new Error("condition not reached"); };

test("shutdown uses one grace deadline, rejects admission, persists cancellation, and preserves unread work", async () => {
  const tools = new Map<string, any>(); const handlers = new Map<string, any>();
  const entries: Array<{ type: string; value: any }> = []; const messages: unknown[] = [];
  const timers = new Map<number, { callback: () => void; milliseconds: number }>(); let nextTimer = 0; let nextId = 0; let terminalFaults = 0;
  const live = { aborts: 0, disposals: 0 };
  const pi = {
    registerTool(tool: any) { tools.set(tool.name, tool); }, on(name: string, handler: any) { handlers.set(name, handler); },
    getActiveTools: () => ["delegate", "delegation_control"], setActiveTools() {},
    appendEntry(type: string, value: any) { if (type.endsWith(":terminal") && terminalFaults-- > 0) throw new Error("disk"); entries.push({ type, value }); },
    sendMessage(message: unknown) { messages.push(message); },
  };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", env: { PI_SUBAGENTS_MINIMAL_SHUTDOWN_GRACE_MS: "1000" }, runtime: {
    id: () => ids[nextId++]!, now: () => new Date("2026-01-02T03:04:05.000Z"), monotonicNow: () => 0,
    setTimer(callback, milliseconds) { const handle = ++nextTimer; timers.set(handle, { callback, milliseconds }); return handle; }, clearTimer(handle) { timers.delete(handle as number); },
    loadAgent: async () => "agent", createModelRuntime: async () => ({ getModel: () => ({ provider: "p", id: "m", reasoning: true }), getAvailable: async () => [{ provider: "p", id: "m" }] }) as never,
    createChild: async (request) => { let listener = (_event: any) => {}; const child = { messages: [] as any[], subscribe(fn: any) { listener = fn; return () => {}; }, async prompt() { listener({ type: "agent_start" }); if (request.task === "live") await new Promise<void>(() => {}); child.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] }); }, async abort() { live.aborts++; await new Promise<void>(() => {}); }, dispose() { live.disposals++; } }; return child; },
  } })(pi as never);
  const ctx = { cwd: "/repo", model: { provider: "p", id: "m" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true, getBranch: () => [] } };
  await handlers.get("session_start")({}, ctx);
  const launch = (task: string) => tools.get("delegate").execute("x", { mode: "single", task: { task } }, new AbortController().signal, undefined, ctx);

  await launch("done"); await waitUntil(() => entries.some((entry) => entry.type.endsWith(":terminal")));
  await launch("live"); await waitUntil(() => live.aborts === 0 && timers.size > 0);
  terminalFaults = 1; const messageCount = messages.length; const shutdown = handlers.get("session_shutdown")();

  await expect(launch("later")).rejects.toThrow("[SHUTTING_DOWN]");
  expect(live.aborts).toBe(1);
  expect([...timers.values()].filter((timer) => timer.milliseconds === 1000)).toHaveLength(1);
  [...timers.values()].find((timer) => timer.milliseconds === 1000)!.callback();
  await shutdown;

  expect(live.disposals).toBeGreaterThan(0);
  expect(entries.filter((entry) => entry.type.endsWith(":terminal"))).toHaveLength(2);
  expect(entries.some((entry) => entry.type.endsWith(":consumed"))).toBe(false);
  expect(messages).toHaveLength(messageCount);
  expect(entries[0]!.value.outcome).toBe("succeeded");
  expect(entries[1]!.value.outcome).toBe("cancelled");
  await handlers.get("session_shutdown")();
  expect(entries.filter((entry) => entry.type.endsWith(":terminal"))).toHaveLength(2);
});
