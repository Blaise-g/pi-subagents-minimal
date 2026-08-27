import { randomUUID, createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StartupConfig } from "./config.ts";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  getAgentDir,
  type AgentSession,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { StringEnum, type Api, type Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type TaskSpecification = { agent: "investigation"; task: string; model?: string; thinking?: ThinkingLevel; reportPath?: string };
export type ChildRunRequest = { cwd: string; task: string; model: Model<Api>; thinking: ThinkingLevel; agentDefinition: string };
export interface ChildSession { messages: readonly unknown[]; subscribe(listener: (event: { type: string }) => void): () => void; prompt(text: string, options?: { expandPromptTemplates?: boolean }): Promise<void>; dispose(): void; abort(): Promise<void> }
export interface RuntimeDependencies {
  id(): string;
  now(): Date;
  loadAgent(): Promise<string>;
  createModelRuntime(signal?: AbortSignal): Promise<ModelRuntime>;
  createChild(request: ChildRunRequest, modelRuntime: ModelRuntime): Promise<ChildSession>;
}

const compact = (value: unknown) => JSON.stringify(value);
const textResult = (value: unknown) => ({ content: [{ type: "text" as const, text: compact(value) }], details: {} });

function assistantText(messages: readonly unknown[]): { text: string; stopReason?: string } | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || typeof message !== "object" || (message as { role?: unknown }).role !== "assistant") continue;
    const candidate = message as { content?: unknown; stopReason?: unknown };
    if (!Array.isArray(candidate.content)) return undefined;
    const text = candidate.content.flatMap((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string" ? [(block as { text: string }).text] : []).filter(Boolean).join("\n\n").trim();
    return { text, stopReason: typeof candidate.stopReason === "string" ? candidate.stopReason : undefined };
  }
  return undefined;
}

async function repositoryRoot(cwd: string): Promise<string> {
  let cursor = await realpath(cwd);
  while (true) {
    try { await realpath(join(cursor, ".git")); return cursor; } catch { /* continue upward */ }
    const parent = dirname(cursor);
    if (parent === cursor) return await realpath(cwd);
    cursor = parent;
  }
}

export const defaultRuntimeDependencies: RuntimeDependencies = {
  id: () => `d_${randomUUID().toLowerCase()}`,
  now: () => new Date(),
  loadAgent: () => readFile(new URL("../agents/investigation.md", import.meta.url), "utf8"),
  createModelRuntime: (signal) => ModelRuntime.create({ signal }),
  async createChild(request, modelRuntime) {
    const root = await repositoryRoot(request.cwd);
    const settingsManager = SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 2 }, compaction: { enabled: true } });
    const loader = new DefaultResourceLoader({
      cwd: request.cwd,
      agentDir: getAgentDir(),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      appendSystemPrompt: [request.agentDefinition],
      agentsFilesOverride: ({ agentsFiles }) => ({ agentsFiles: agentsFiles.filter((file) => resolve(file.path).startsWith(`${root}/`) || resolve(file.path) === root) }),
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd: request.cwd,
      model: request.model,
      thinkingLevel: request.thinking as never,
      modelRuntime,
      tools: ["read", "grep", "find", "ls"],
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager,
    });
    return session as AgentSession;
  },
};

type TerminalEnvelope = { schemaVersion: 1; delegationId: string; outcome: "succeeded"; completedAt: string; taskCount: 1; order: "input"; children: [{ index: 0; outcome: "succeeded"; effectiveModel: string; effectiveThinking: ThinkingLevel; result: string }] };
type RecordState = { phase: "queued" | "running" | "finalizing" | "terminal"; childPhase: "queued" | "setup" | "running" | "terminal"; envelope?: TerminalEnvelope; unread: boolean; diagnostics: never[] };

const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8");
const fail = (code: string, message: string): never => { throw new Error(`[${code}] ${message}`); };

function validateSingleInput(input: { mode: string; task?: TaskSpecification }): TaskSpecification {
  if (input.mode !== "single") fail("INPUT_INVALID", "Expected one single Task specification");
  const task = input.task;
  if (task === undefined) throw new Error("[INPUT_INVALID] Expected one single Task specification");
  if (task.agent !== "investigation") fail("AGENT_UNKNOWN", "Agent must be investigation");
  const taskBytes = utf8Bytes(task.task);
  if (taskBytes < 1 || taskBytes > 16 * 1024) fail("INPUT_INVALID", "task must be 1..16384 UTF-8 bytes");
  if (task.model !== undefined) {
    const bytes = utf8Bytes(task.model);
    if (bytes < 1 || bytes > 256 || !/^[^/]+\/[^/]+$/.test(task.model)) fail("INPUT_INVALID", "model must be one provider/model pair of at most 256 UTF-8 bytes");
  }
  if (task.reportPath !== undefined) {
    const bytes = utf8Bytes(task.reportPath);
    if (bytes < 1 || bytes > 1024 || !/^artifacts\/(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\/\/)[^\\]+\.md$/.test(task.reportPath)) {
      fail("REPORT_PATH_INVALID", "reportPath must be a safe normalized Markdown path beneath artifacts/");
    }
    // Report execution is introduced by the report tracer; admitting it now would grant no writer capability.
    fail("INPUT_INVALID", "Declared reports are not available in this release slice");
  }
  return task;
}

async function boundedPreflight<T>(timeoutMs: number, callerSignal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (callerSignal.aborted) fail("PREFLIGHT_TIMEOUT", "Preflight was aborted");
  const controller = new AbortController();
  const onAbort = () => controller.abort(callerSignal.reason);
  callerSignal.addEventListener("abort", onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("[PREFLIGHT_TIMEOUT] Preflight exceeded the Setup timeout")); }, timeoutMs);
  });
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("[PREFLIGHT_TIMEOUT] Preflight was aborted")), { once: true }));
  try { return await Promise.race([operation(controller.signal), deadline, aborted]); }
  finally { if (timer) clearTimeout(timer); callerSignal.removeEventListener("abort", onAbort); }
}

export function installSuccessfulSingleRuntime(pi: ExtensionAPI, dependencies: RuntimeDependencies, agentDefinition: Promise<string>, config: StartupConfig) {
  const records = new Map<string, RecordState>();
  let activation = Promise.resolve();
  const updateActivation = (wanted: boolean) => activation = activation.then(() => {
    const active = pi.getActiveTools();
    const next = wanted ? [...new Set([...active, "delegation_control"])] : active.filter((name) => name !== "delegation_control");
    if (next.length !== active.length || next.some((name, index) => name !== active[index])) pi.setActiveTools(next);
  });

  pi.registerTool({
    name: "delegation_control", label: "Delegation Control",
    description: "Inspect a live or completed Delegation, or request cancellation of the whole Delegation.",
    parameters: Type.Object({ action: StringEnum(["inspect", "cancel"] as const), delegationId: Type.String() }, { additionalProperties: false }),
    async execute(_id, input) {
      const record = records.get(input.delegationId);
      if (!record) throw new Error("[INPUT_INVALID] Unknown Delegation id");
      if (input.action === "cancel" && record.phase !== "terminal") throw new Error("[INPUT_INVALID] Cancellation is not available for this completed tracer");
      if (record.phase !== "terminal") return textResult({ schemaVersion: 1, delegationId: input.delegationId, phase: record.phase, children: [{ index: 0, phase: record.childPhase }], diagnostics: [] });
      if (record.unread) {
        const json = compact(record.envelope);
        pi.appendEntry("pi-subagents-minimal:consumed", { schemaVersion: 1, delegationId: input.delegationId, envelopeSha256: createHash("sha256").update(json).digest("hex"), consumedAt: dependencies.now().toISOString() });
        record.unread = false;
        await updateActivation([...records.values()].some((item) => item.phase !== "terminal" || item.unread));
      }
      return textResult({ envelope: record.envelope, diagnostics: record.diagnostics });
    },
  });

  return async (input: { mode: "single"; task: TaskSpecification }, signal: AbortSignal, ctx: ExtensionContext) => {
    const admitted = await boundedPreflight(config.setupTimeoutMs, signal, async (preflightSignal) => {
      const task = validateSingleInput(input);
      const modelName = task.model ?? (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      if (modelName === undefined) throw new Error("[MODEL_NOT_FOUND] A provider/model is required");
      const effectiveThinking = task.thinking ?? ctx.thinkingLevel ?? "off";
      const modelRuntime = await dependencies.createModelRuntime(preflightSignal);
      const [provider, id] = modelName.split("/") as [string, string];
      const model = modelRuntime.getModel(provider, id);
      if (model === undefined) throw new Error("[MODEL_NOT_FOUND] Model was not found");
      const available = await modelRuntime.getAvailable(undefined, { signal: preflightSignal });
      if (!available.some((candidate) => candidate.provider === provider && candidate.id === id)) fail("MODEL_UNAVAILABLE", "Model authentication is unavailable");
      if ((!model.reasoning && effectiveThinking !== "off") || model.thinkingLevelMap?.[effectiveThinking] === null) fail("THINKING_UNSUPPORTED", "Thinking level is unsupported");
      const parentSession = ctx.sessionManager as typeof ctx.sessionManager & { isPersisted?: () => boolean };
      if (typeof parentSession.isPersisted !== "function" || !parentSession.isPersisted()) fail("PARENT_SESSION_EPHEMERAL", "Parent session must be persisted");
      const definition = await agentDefinition;
      const maximumEnvelope = compact({ schemaVersion: 1, delegationId: "d_00000000-0000-4000-8000-000000000000", outcome: "succeeded", completedAt: "9999-12-31T23:59:59.999Z", taskCount: 1, order: "input", children: [{ index: 0, outcome: "succeeded", effectiveModel: modelName, effectiveThinking, result: "x" }] });
      if (utf8Bytes(maximumEnvelope) > 32 * 1024) fail("ENVELOPE_BUDGET_EXCEEDED", "Protected Terminal envelope metadata exceeds its budget");
      return { task, modelName, effectiveThinking, modelRuntime, model, definition };
    });
    const { task, modelName, effectiveThinking, modelRuntime, model, definition } = admitted;
    const delegationId = dependencies.id();
    const record: RecordState = { phase: "queued", childPhase: "queued", unread: false, diagnostics: [] };
    records.set(delegationId, record);
    await updateActivation(true);
    void (async () => {
      let child: ChildSession | undefined;
      try {
        record.childPhase = "setup";
        child = await dependencies.createChild({ cwd: ctx.cwd, task: task.task, model, thinking: effectiveThinking, agentDefinition: definition }, modelRuntime);
        let started = false;
        const unsubscribe = child.subscribe((event) => { if (!started && event.type === "agent_start") { started = true; record.phase = "running"; record.childPhase = "running"; } });
        try { await child.prompt(task.task, { expandPromptTemplates: false }); } finally { unsubscribe(); }
        const answer = assistantText(child.messages);
        if (!started || answer?.stopReason !== "stop" || !answer.text) throw new Error("Child did not produce a successful final answer");
        record.childPhase = "terminal"; record.phase = "finalizing";
        const result = Buffer.from(answer.text).subarray(0, 16 * 1024).toString("utf8").replace(/\uFFFD$/, "");
        const envelope: TerminalEnvelope = { schemaVersion: 1, delegationId, outcome: "succeeded", completedAt: dependencies.now().toISOString(), taskCount: 1, order: "input", children: [{ index: 0, outcome: "succeeded", effectiveModel: modelName, effectiveThinking, result }] };
        pi.appendEntry("pi-subagents-minimal:terminal", envelope);
        record.envelope = envelope; record.phase = "terminal"; record.unread = true;
        await updateActivation(true);
        pi.sendMessage({ customType: "pi-subagents-minimal:completion", content: `Delegation ${delegationId} completed: succeeded. Use delegation_control inspect to retrieve it.`, display: true }, { deliverAs: "steer", triggerTurn: true });
      } finally { child?.dispose(); }
    })();
    return textResult({ schemaVersion: 1, delegationId, phase: "queued", taskCount: 1 });
  };
}
