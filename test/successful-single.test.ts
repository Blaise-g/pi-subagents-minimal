import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const waitUntil = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition not reached");
};

test("runs an isolated Investigation and persists before notifying and consuming", async () => {
  const tools = new Map<string, { execute: (...args: never[]) => Promise<{ content: Array<{ text: string }>; details: unknown }> }>();
  const events: string[] = [];
  const active = ["delegate", "other_extension_tool"];
  let childRequest: Record<string, unknown> | undefined;
  const child = {
    messages: [] as unknown[],
    subscribe(listener: (event: { type: string }) => void) { this.listener = listener; return () => events.push("unsubscribed"); },
    listener: (_event: { type: string }) => {},
    async prompt(task: string, options: unknown) {
      events.push(`prompt:${task}:${JSON.stringify(options)}`);
      this.listener({ type: "agent_start" });
      this.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "bounded answer" }] });
    },
    dispose() { events.push("disposed"); },
    async abort() {},
  };
  const pi = {
    registerTool(tool: { name: string; execute: (...args: never[]) => Promise<{ content: Array<{ text: string }>; details: unknown }> }) { tools.set(tool.name, tool); },
    on() {},
    getActiveTools: () => [...active],
    setActiveTools(names: string[]) { active.splice(0, active.length, ...names); events.push(`active:${names.join(",")}`); },
    appendEntry(type: string) { events.push(`persist:${type}`); },
    sendMessage(message: { content: string }) { events.push(`notify:${message.content}`); },
  };
  createExtension({
    piVersion: "0.84.3", nodeVersion: "22.19.0",
    runtime: {
      id: () => "d_00000000-0000-4000-8000-000000000000",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      loadAgent: async () => "EXACT AGENT",
      createModelRuntime: async () => ({
        getModel: () => ({ provider: "test", id: "model" }),
        getAvailable: async () => [{ provider: "test", id: "model" }],
      }) as never,
      async createChild(request) { childRequest = request as unknown as Record<string, unknown>; return child; },
    },
  })(pi as never);

  const ctx = {
    cwd: "/repo", model: { provider: "test", id: "model" }, thinkingLevel: "high",
    sessionManager: { isPersisted: () => true, getSessionFile: () => "/session.jsonl" },
  };
  const accepted = await tools.get("delegate")!.execute("call" as never, { mode: "single", task: { agent: "investigation", task: "inspect it" } } as never, new AbortController().signal as never, undefined as never, ctx as never);
  expect(JSON.parse(accepted.content[0]!.text)).toEqual({ schemaVersion: 1, delegationId: "d_00000000-0000-4000-8000-000000000000", phase: "queued", taskCount: 1 });
  await waitUntil(() => events.some((event) => event.startsWith("notify:")));
  expect(childRequest).toMatchObject({ cwd: "/repo", task: "inspect it", thinking: "high", agentDefinition: "EXACT AGENT" });
  expect(events.findIndex((event) => event === "persist:pi-subagents-minimal:terminal")).toBeLessThan(events.findIndex((event) => event.startsWith("notify:")));
  expect(active).toContain("other_extension_tool");

  const inspection = await tools.get("delegation_control")!.execute("call" as never, { action: "inspect", delegationId: "d_00000000-0000-4000-8000-000000000000" } as never, new AbortController().signal as never, undefined as never, ctx as never);
  const terminal = JSON.parse(inspection.content[0]!.text);
  expect(terminal.envelope.children[0].result).toBe("bounded answer");
  expect(inspection.details).toEqual({});
  expect(events).toContain("persist:pi-subagents-minimal:consumed");
  expect(active).toEqual(["delegate", "other_extension_tool"]);
});
