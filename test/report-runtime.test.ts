import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createExtension } from "../src/index.ts";

const waitUntil = async (predicate: () => boolean) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await Bun.sleep(5); } throw new Error("condition not reached"); };

test("gives a report Subagent only its closure-bound writer and projects path plus summary", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-report-runtime-"));
  try {
    const tools = new Map<string, any>();
    let childTools: any[] | undefined;
    let completed = false;
    const child = {
      messages: [] as any[], listener: (_event: any) => {},
      subscribe(listener: (event: any) => void) { this.listener = listener; return () => {}; },
      async prompt() {
        this.listener({ type: "agent_start" });
        await childTools![0].execute("write", { content: "# Complete evidence" }, undefined, undefined, {});
        this.messages.push({ role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Evidence gathered; artifacts/evidence.md" }] });
      },
      dispose() {}, async abort() {},
    };
    createExtension({
      piVersion: "0.84.3", nodeVersion: "22.19.0",
      runtime: {
        id: () => "d_report", now: () => new Date("2026-01-01T00:00:00.000Z"), loadAgent: async () => "agent",
        createModelRuntime: async () => ({ getModel: () => ({ provider: "test", id: "model", reasoning: true }), getAvailable: async () => [{ provider: "test", id: "model" }] }) as never,
        async createChild(request) { childTools = request.customTools; return child; },
      },
    })({ registerTool: (tool: any) => tools.set(tool.name, tool), on() {}, getActiveTools: () => ["delegate"], setActiveTools() {}, appendEntry() {}, sendMessage() { completed = true; } } as never);
    const ctx = { cwd, model: { provider: "test", id: "model" }, thinkingLevel: "off", sessionManager: { isPersisted: () => true } };
    await tools.get("delegate").execute("call", { mode: "single", task: { task: "research", reportPath: "artifacts/evidence.md" } }, undefined, undefined, ctx);
    await waitUntil(() => completed);
    expect(childTools?.map((tool) => tool.name)).toEqual(["write_report"]);
    const inspection = await tools.get("delegation_control").execute("call", { action: "inspect", delegationId: "d_report" });
    expect(JSON.parse(inspection.content[0].text).envelope.children[0]).toMatchObject({ outcome: "succeeded", effectiveTools: ["read", "grep", "find", "ls", "write_report"], report: { path: "artifacts/evidence.md", summary: "Evidence gathered; artifacts/evidence.md" } });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
