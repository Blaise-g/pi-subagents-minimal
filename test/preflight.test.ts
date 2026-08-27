import { describe, expect, test } from "bun:test";
import { createExtension } from "../src/index.ts";

function fixture(overrides: { model?: unknown; available?: unknown[]; runtime?: () => Promise<never>; persisted?: boolean } = {}) {
  const effects = { ids: 0, children: 0, entries: 0, activations: 0 };
  const tools = new Map<string, { execute: (...args: any[]) => Promise<unknown> }>();
  createExtension({
    piVersion: "0.84.3", nodeVersion: "22.19.0",
    runtime: {
      id: () => { effects.ids++; return "d_test"; }, now: () => new Date(), loadAgent: async () => "agent",
      createModelRuntime: overrides.runtime ?? (async () => ({
        getModel: () => Object.hasOwn(overrides, "model") ? overrides.model : { provider: "test", id: "model", reasoning: true },
        getAvailable: async () => overrides.available ?? [{ provider: "test", id: "model" }],
      }) as never),
      createChild: async () => { effects.children++; return { messages: [], subscribe: () => () => {}, prompt: () => new Promise<void>(() => {}), dispose() {}, abort: async () => {} }; },
    },
  })({
    registerTool: (tool: any) => tools.set(tool.name, tool), on() {}, getActiveTools: () => ["delegate"],
    setActiveTools: () => { effects.activations++; }, appendEntry: () => { effects.entries++; }, sendMessage() {},
  } as never);
  const ctx = { cwd: "/repo", model: { provider: "test", id: "model" }, thinkingLevel: "medium", sessionManager: { isPersisted: () => overrides.persisted ?? true } };
  const execute = (task: Record<string, unknown>, signal = new AbortController().signal) => tools.get("delegate")!.execute("call", { mode: "single", task }, signal, undefined, ctx);
  return { execute, effects };
}

const assertNoAdmission = (effects: ReturnType<typeof fixture>["effects"]) => expect(effects).toEqual({ ids: 0, children: 0, entries: 0, activations: 0 });

describe("single Delegation preflight", () => {
  test.each([
    [{ agent: "other", task: "x" }, "AGENT_UNKNOWN"],
    [{ agent: "investigation", task: "" }, "INPUT_INVALID"],
    [{ agent: "investigation", task: "🙂".repeat(4097) }, "INPUT_INVALID"],
    [{ agent: "investigation", task: "x", model: "broken" }, "INPUT_INVALID"],
    [{ agent: "investigation", task: "x", model: `${"p".repeat(255)}/m` }, "INPUT_INVALID"],
    [{ agent: "investigation", task: "x", reportPath: "../escape.md" }, "REPORT_PATH_INVALID"],
  ] as const)("rejects semantic input %# with %s", async (task, code) => {
    const { execute, effects } = fixture();
    await expect(execute(task)).rejects.toThrow(`[${code}]`);
    assertNoAdmission(effects);
  });

  test("accepts the exact UTF-8 task and model byte boundaries", async () => {
    const provider = "p".repeat(253);
    const { execute, effects } = fixture({ model: { provider, id: "m", reasoning: true }, available: [{ provider, id: "m" }] });
    const accepted = await execute({ agent: "investigation", task: "🙂".repeat(4096), model: `${provider}/m`, thinking: "off" }) as any;
    expect(JSON.parse(accepted.content[0].text).phase).toBe("queued");
    expect(effects.ids).toBe(1);
  });

  test.each([
    [undefined, [], "MODEL_NOT_FOUND"],
    [{ provider: "test", id: "model", reasoning: true }, [], "MODEL_UNAVAILABLE"],
    [{ provider: "test", id: "model", reasoning: false }, [{ provider: "test", id: "model" }], "THINKING_UNSUPPORTED"],
  ] as const)("sanitizes model preflight failures %#", async (model, available, code) => {
    const { execute, effects } = fixture({ model, available: [...available] });
    await expect(execute({ agent: "investigation", task: "x" })).rejects.toThrow(`[${code}]`);
    assertNoAdmission(effects);
  });

  test("rejects ephemeral parent state before allocating an id", async () => {
    const { execute, effects } = fixture({ persisted: false });
    await expect(execute({ agent: "investigation", task: "x", thinking: "off" })).rejects.toThrow("[PARENT_SESSION_EPHEMERAL]");
    assertNoAdmission(effects);
  });

  test("bounds preflight by caller abort", async () => {
    const controller = new AbortController();
    const { execute, effects } = fixture({ runtime: () => new Promise(() => {}) });
    const pending = execute({ agent: "investigation", task: "x" }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("[PREFLIGHT_TIMEOUT]");
    assertNoAdmission(effects);
  });
});
