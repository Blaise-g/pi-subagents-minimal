import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

const id = "d_00000000-0000-4000-8000-000000000000";
const envelope = { schemaVersion: 1, delegationId: id, outcome: "succeeded", completedAt: "2026-01-02T03:04:05.000Z", taskCount: 1, order: "input", children: [{ index: 0, outcome: "succeeded", effectiveModel: "test/model", effectiveThinking: "high", result: "byte stable ✓" }] } as const;
const custom = (customType: string, data: unknown) => ({ type: "custom", customType, data });

function fixture(branch: unknown[], failMarkers = 0) {
  const tools = new Map<string, any>(); const handlers = new Map<string, any>(); const active = ["delegate", "other"]; const appended: Array<{ type: string; value: any }> = []; const messages: unknown[] = [];
  const pi = { registerTool(tool: any) { tools.set(tool.name, tool); }, on(name: string, handler: any) { handlers.set(name, handler); }, getActiveTools: () => [...active], setActiveTools(value: string[]) { active.splice(0, active.length, ...value); }, appendEntry(type: string, value: any) { if (type.endsWith(":consumed") && failMarkers-- > 0) throw new Error("disk"); appended.push({ type, value }); }, sendMessage(value: unknown) { messages.push(value); } };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", runtime: { id: () => id, now: () => new Date("2026-02-03T04:05:06.000Z"), loadAgent: async () => "agent", createModelRuntime: async () => { throw new Error("unused"); }, createChild: async () => { throw new Error("unused"); } } })(pi as never);
  const start = async (next = branch) => handlers.get("session_start")!({}, { sessionManager: { getBranch: () => next } });
  const inspect = async () => tools.get("delegation_control").execute("call", { action: "inspect", delegationId: id });
  return { start, inspect, active, appended, messages };
}

test("reconstructs unread active-branch envelopes without replaying notification", async () => {
  const f = fixture([custom("pi-subagents-minimal:terminal", envelope)]); await f.start();
  expect(f.active).toContain("delegation_control"); expect(f.messages).toEqual([]);
  const result = await f.inspect(); expect(result.content[0].text).toContain('"result":"byte stable ✓"');
  expect(f.appended[0]!.value.envelopeSha256).toBe(createHash("sha256").update(JSON.stringify(envelope)).digest("hex"));
  expect(f.active).toEqual(["delegate", "other"]);
});

test("marker failure leaves unread and permits byte-identical duplicate delivery", async () => {
  const f = fixture([custom("pi-subagents-minimal:terminal", envelope)], 1); await f.start();
  const first = await f.inspect(); expect(JSON.parse(first.content[0].text).diagnostics.at(-1).code).toBe("CONSUMED_MARKER_PERSIST_FAILED");
  expect(f.active).toContain("delegation_control");
  const second = await f.inspect(); expect(JSON.parse(second.content[0].text).envelope).toEqual(JSON.parse(first.content[0].text).envelope);
  expect(f.appended).toHaveLength(1); expect(f.active).not.toContain("delegation_control");
  await f.inspect(); expect(f.appended).toHaveLength(1);
});

test("applies matching markers in order and reports malformed and mismatched entries", async () => {
  const digest = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
  const f = fixture([
    custom("pi-subagents-minimal:consumed", { schemaVersion: 1, delegationId: id, envelopeSha256: digest, consumedAt: "2026-01-02T03:04:05.000Z" }),
    custom("pi-subagents-minimal:terminal", { ...envelope, schemaVersion: 2 }),
    custom("pi-subagents-minimal:terminal", envelope),
    custom("pi-subagents-minimal:consumed", { schemaVersion: 1, delegationId: id, envelopeSha256: "0".repeat(64), consumedAt: "2026-01-02T03:04:05.000Z" }),
    custom("pi-subagents-minimal:consumed", { schemaVersion: 1, delegationId: id, envelopeSha256: digest, consumedAt: "2026-01-02T03:04:05.000Z" }),
  ]); await f.start(); expect(f.active).not.toContain("delegation_control");
  const body = JSON.parse((await f.inspect()).content[0].text); expect(body.envelope).toEqual(envelope); expect(body.diagnostics.filter((x: any) => x.code === "PERSISTED_ENTRY_UNREADABLE").length).toBe(2); expect(f.appended).toHaveLength(0);
});

test("consuming one of multiple unread envelopes keeps control active", async () => {
  const second = { ...envelope, delegationId: "d_00000000-0000-4000-8000-000000000001" };
  const f = fixture([custom("pi-subagents-minimal:terminal", envelope), custom("pi-subagents-minimal:terminal", second)]); await f.start();
  await f.inspect(); expect(f.active).toContain("delegation_control");
});

test("branch switching rebuilds only from the new active branch", async () => {
  const f = fixture([custom("pi-subagents-minimal:terminal", envelope)]); await f.start(); expect(f.active).toContain("delegation_control");
  await f.start([]); expect(f.active).not.toContain("delegation_control"); await expect(f.inspect()).rejects.toThrow("Unknown Delegation id");
});
