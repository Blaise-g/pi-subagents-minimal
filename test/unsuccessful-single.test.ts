import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(runTimeoutMs = 1_000) {
  const tools = new Map<string, any>();
  const entries: any[] = [];
  const messages: any[] = [];
  let timer: (() => void) | undefined;
  let listener = (_event: { type: string }) => {};
  const child = {
    messages,
    subscribe(fn: typeof listener) { listener = fn; return () => {}; },
    prompt: async () => {},
    dispose() {},
    async abort() {},
  };
  const pi = {
    registerTool(tool: any) { tools.set(tool.name, tool); }, on() {}, getActiveTools: () => ["delegate"], setActiveTools() {},
    appendEntry(type: string, value: unknown) { entries.push({ type, value }); }, sendMessage() {},
  };
  createExtension({
    piVersion: "0.84.3", nodeVersion: "22.19.0", env: { PI_SUBAGENTS_MINIMAL_RUN_TIMEOUT_MS: String(runTimeoutMs) },
    runtime: {
      id: () => "d_test", now: () => new Date("2026-01-02T03:04:05.000Z"), monotonicNow: () => 0,
      setTimer(fn: () => void) { timer = fn; return 1; }, clearTimer() {},
      loadAgent: async () => "agent", createModelRuntime: async () => ({ getModel: () => ({ provider: "p", id: "m", reasoning: true }), getAvailable: async () => [{ provider: "p", id: "m" }] }) as never,
      createChild: async () => child,
    },
  })(pi as never);
  const execute = () => tools.get("delegate").execute("x", { mode: "single", task: { agent: "investigation", task: "task" } }, new AbortController().signal, undefined, { cwd: "/repo", model: { provider: "p", id: "m" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true } });
  return { tools, entries, child, execute, start: () => listener({ type: "agent_start" }), fire: () => timer?.() };
}

test("a running timeout wins atomically and retains bounded useful text", async () => {
  const f = fixture();
  f.child.prompt = async () => await new Promise<void>(() => {});
  await f.execute(); await tick();
  f.start();
  f.child.messages.push({ role: "assistant", stopReason: "length", content: [{ type: "text", text: "é".repeat(3000) }] });
  f.fire(); await tick(); await tick();
  const envelope = f.entries.find((entry) => entry.type.endsWith(":terminal")).value;
  expect(envelope.outcome).toBe("timed_out");
  expect(envelope.children[0]).toMatchObject({ outcome: "timed_out", error: { stage: "run", code: "RUN_TIMEOUT" } });
  expect(Buffer.byteLength(envelope.children[0].partialResult, "utf8")).toBeLessThanOrEqual(4096);
});

test("output length is a run failure, not success", async () => {
  const f = fixture();
  f.child.prompt = async () => { f.start(); f.child.messages.push({ role: "assistant", stopReason: "length", content: [{ type: "text", text: "useful" }] }); };
  await f.execute(); await tick(); await tick();
  const envelope = f.entries.find((entry) => entry.type.endsWith(":terminal")).value;
  expect(envelope.children[0]).toMatchObject({ outcome: "failed", partialResult: "useful", error: { stage: "run", code: "OUTPUT_LENGTH" } });
});
