import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitUntil = async (predicate: () => boolean) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } throw new Error("condition not reached"); };

function fixture() {
  const tools = new Map<string, any>(); const entries: any[] = []; const pending: any[] = []; const timers: Array<{ at: number; fn: () => void; cleared: boolean }> = []; let now = 0; let ids = 0;
  const pi = { registerTool(t: any) { tools.set(t.name, t); }, on() {}, getActiveTools: () => ["delegate"], setActiveTools() {}, appendEntry(type: string, value: unknown) { entries.push({ type, value }); }, sendMessage() {} };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", env: { PI_SUBAGENTS_MINIMAL_CONCURRENCY: "1", PI_SUBAGENTS_MINIMAL_CANCEL_TIMEOUT_MS: "1000" }, runtime: {
    id: () => `d_${++ids}`, now: () => new Date(1_700_000_000_000 + now), monotonicNow: () => now,
    setTimer(fn, ms) { const timer = { at: now + ms, fn, cleared: false }; timers.push(timer); return timer; }, clearTimer(handle) { (handle as any).cleared = true; }, loadAgent: async () => "agent",
    createModelRuntime: async () => ({ getModel: () => ({ provider: "p", id: "m", reasoning: true }), getAvailable: async () => [{ provider: "p", id: "m" }] }) as never,
    createChild: async (request) => { let listener = (_: any) => {}; let resolve!: () => void; const done = new Promise<void>((r) => resolve = r); let abortResolve!: () => void; const aborted = new Promise<void>((r) => abortResolve = r); const child = { messages: [] as any[], disposed: 0, aborts: 0, subscribe(fn: any) { listener = fn; return () => {}; }, async prompt() { listener({ type: "agent_start" }); await done; }, async abort() { child.aborts++; await aborted; }, dispose() { child.disposed++; } }; pending.push({ task: request.task, child, resolve, abortResolve }); return child; },
  } })(pi as never);
  const ctx = { cwd: "/repo", model: { provider: "p", id: "m" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true } };
  const launch = async (tasks: string[]) => JSON.parse((await tools.get("delegate").execute("x", { mode: "batch", tasks: tasks.map(task => ({ agent: "investigation", task })) }, new AbortController().signal, undefined, ctx)).content[0].text).delegationId;
  const control = async (id: string, action = "cancel") => JSON.parse((await tools.get("delegation_control").execute("x", { action, delegationId: id })).content[0].text);
  const advance = async (ms: number) => { now += ms; for (const timer of timers.filter(t => !t.cleared && t.at <= now)) { timer.cleared = true; timer.fn(); } await tick(); };
  return { launch, control, advance, pending, entries };
}

test("cancellation is shared-deadline bounded, idempotent, and preserves completed siblings", async () => {
  const f = fixture(); const id = await f.launch(["running", "queued"]); await waitUntil(() => f.pending.length === 1);
  const first = await f.control(id); expect(first.phase).toBe("cancelling"); expect(first.children[1].phase).toBe("terminal"); expect(f.pending[0].child.aborts).toBe(1);
  await f.advance(500); await f.control(id); await f.advance(500);
  await waitUntil(() => f.entries.some(e => e.type.endsWith(":terminal"))); const envelope = f.entries.find(e => e.type.endsWith(":terminal")).value;
  expect(envelope.outcome).toBe("cancelled"); expect(envelope.children.map((c: any) => c.outcome)).toEqual(["cancelled", "cancelled"]); expect(f.pending[0].child.disposed).toBeGreaterThan(0);
  f.pending[0].child.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "late" }] }); f.pending[0].resolve(); await tick();
  expect(f.entries.find(e => e.type.endsWith(":terminal")).value.children[0].outcome).toBe("cancelled");
});

test("a completed sibling remains succeeded when live execution is cancelled", async () => {
  const f = fixture(); const id = await f.launch(["completed", "live"]); await waitUntil(() => f.pending.length === 1);
  f.pending[0].child.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "kept" }] }); f.pending[0].resolve();
  await waitUntil(() => f.pending.length === 2); await f.control(id); await f.advance(1000);
  await waitUntil(() => f.entries.some(e => e.type.endsWith(":terminal"))); const envelope = f.entries.find(e => e.type.endsWith(":terminal")).value;
  expect(envelope.outcome).toBe("cancelled"); expect(envelope.children.map((c: any) => c.outcome)).toEqual(["succeeded", "cancelled"]); expect(envelope.children[0].result).toBe("kept");
});

test("unknown Delegation ids return a sanitized error", async () => {
  const f = fixture(); await expect(f.control("secret/path/that-must-not-echo", "inspect")).rejects.toThrow("[INPUT_INVALID] Unknown Delegation id");
});
