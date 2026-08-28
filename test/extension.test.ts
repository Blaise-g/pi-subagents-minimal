import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createExtension, isSupportedHost } from "../extensions/subagents-minimal.ts";
import { loadExtensionHarness } from "./harness.ts";

const key = "PI_SUBAGENTS_MINIMAL_CONCURRENCY";
const original = process.env[key];
afterEach(() => original === undefined ? delete process.env[key] : process.env[key] = original);

describe("host compatibility", () => {
  test.each(["0.84.3", "0.84.99"])("accepts supported stable Pi %s", (version) => {
    expect(isSupportedHost(version, "22.19.0")).toBe(true);
  });
  test.each(["0.84.2", "0.85.0", "0.84.3-beta.1", "garbage"])("rejects Pi %s", (version) => {
    expect(isSupportedHost(version, "22.19.0")).toBe(false);
  });
  test("rejects old Node", () => expect(isSupportedHost("0.84.3", "22.18.9")).toBe(false));

  test("emits one bounded diagnostic and registers nothing", () => {
    const diagnostics: string[] = [];
    const tools: unknown[] = [];
    const handlers: unknown[] = [];
    createExtension({ piVersion: "0.85.0", writeStderr: (line) => diagnostics.push(line) })({
      registerTool: (tool: unknown) => tools.push(tool),
      on: (...handler: unknown[]) => handlers.push(handler),
    } as never);
    expect(diagnostics).toHaveLength(1);
    expect(Buffer.byteLength(diagnostics[0]!)).toBeLessThanOrEqual(512);
    expect(diagnostics[0]).toContain("[HOST_UNSUPPORTED]");
    expect(tools).toEqual([]);
    expect(handlers).toEqual([]);
  });
});

test("the public Pi loader loads the extension and invalid config disables admission", async () => {
  process.env[key] = "04";
  const { extension } = await loadExtensionHarness(resolve("extensions/subagents-minimal.ts"));
  expect([...extension.tools.keys()]).toEqual(["delegate"]);
  const delegate = extension.tools.get("delegate")!;
  await expect(delegate.definition.execute("call", { mode: "single", task: { task: "x" } }, new AbortController().signal, undefined, {} as never))
    .rejects.toThrow(/^\[CONFIG_INVALID\]/);
  expect(extension.handlers.get("session_start")).toBeUndefined();
});

test("packaged Subagent bytes equal the approved fixture", async () => {
  const [agent, fixture] = await Promise.all([
    readFile(resolve("agents/subagent.md")), readFile(resolve("test/fixtures/subagent.md")),
  ]);
  expect(agent.equals(fixture)).toBe(true);
});
