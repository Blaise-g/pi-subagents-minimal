import { describe, expect, test } from "bun:test";
import baselines from "../budgets/context-baselines.json" with { type: "json" };
import { createExtension } from "../src/index.ts";

const wire = (tool: any) => ({ type: "function", name: tool.name, description: tool.description, parameters: tool.parameters });
const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

function registeredTools() {
  const tools = new Map<string, any>();
  const events: string[] = [];
  const pi = { registerTool: (tool: any) => tools.set(tool.name, tool), on(name: string) { events.push(name); }, getActiveTools: () => [], setActiveTools() {}, appendEntry() {}, sendMessage() {} };
  createExtension({ piVersion: "0.84.3", nodeVersion: "22.19.0", env: {}, runtime: { loadAgent: async () => "PACKAGE INVESTIGATION INSTRUCTIONS" } as never })(pi as never);
  return { tools, events };
}

describe("parent context contract", () => {
  test("tool surfaces stay under ceilings and within 10% of reviewed baselines", () => {
    const { tools } = registeredTools();
    const measured = {
      launchOnlyBytes: size([wire(tools.get("delegate"))]),
      controlOnlyBytes: size([wire(tools.get("delegation_control"))]),
      bothActiveBytes: size([wire(tools.get("delegate")), wire(tools.get("delegation_control"))]),
      addedPromptChars: 0,
    };
    for (const [name, value] of Object.entries(measured)) {
      const contract = baselines.deterministic[name as keyof typeof baselines.deterministic];
      expect(value, `${name} absolute ceiling`).toBeLessThanOrEqual(contract.ceiling);
      expect(value, `${name} >10% growth; justify and review a baseline update`).toBeLessThanOrEqual(Math.floor(contract.baseline * 1.1));
      expect(contract.baseline, `${name} baseline cannot exceed ceiling`).toBeLessThanOrEqual(contract.ceiling);
    }
  });

  test("tools and parent prompt contain no package instructions", () => {
    const { tools, events } = registeredTools();
    for (const tool of tools.values()) {
      expect(tool.promptSnippet).toBeUndefined();
      expect(tool.promptGuidelines).toBeUndefined();
    }
    expect(events).not.toContain("before_agent_start");
    expect(baselines.protocol.packagePromptText).toBe("");
  });

  test("both provider repetitions independently satisfy the token ceiling", () => {
    for (const [name, condition] of Object.entries(baselines.provider.conditions)) {
      expect(condition.repetitions, `${name} must be repeated twice`).toHaveLength(baselines.protocol.repetitions);
      expect(condition.baseline, `${name} baseline cannot exceed ceiling`).toBeLessThanOrEqual(baselines.provider.ceiling);
      for (const value of condition.repetitions) expect(value, `${name} provider-token ceiling`).toBeLessThanOrEqual(baselines.provider.ceiling);
    }
  });
});
