import { randomUUID, createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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

export function installSuccessfulSingleRuntime(pi: ExtensionAPI, dependencies: RuntimeDependencies, agentDefinition: Promise<string>) {
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
    if (input.mode !== "single" || input.task.agent !== "investigation" || input.task.reportPath !== undefined) throw new Error("[INPUT_INVALID] This release slice accepts one read-only investigation");
    const bytes = Buffer.byteLength(input.task.task);
    if (bytes < 1 || bytes > 16 * 1024) throw new Error("[INPUT_INVALID] task must be 1..16384 UTF-8 bytes");
    const parentSession = ctx.sessionManager as typeof ctx.sessionManager & { isPersisted?: () => boolean };
    if (parentSession.isPersisted?.() === false || (!parentSession.isPersisted && !ctx.sessionManager.getSessionFile())) throw new Error("[PARENT_SESSION_EPHEMERAL] Parent session must be persisted");
    const modelRuntime = await dependencies.createModelRuntime(signal);
    const modelName = input.task.model ?? (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
    if (!modelName || !/^[^/]+\/[^/]+$/.test(modelName)) throw new Error("[MODEL_NOT_FOUND] A provider/model is required");
    const [provider, id] = modelName.split("/") as [string, string];
    const model = modelRuntime.getModel(provider, id);
    if (!model) throw new Error("[MODEL_NOT_FOUND] Model was not found");
    const available = await modelRuntime.getAvailable(undefined, { signal });
    if (!available.some((candidate) => candidate.provider === provider && candidate.id === id)) throw new Error("[MODEL_UNAVAILABLE] Model authentication is unavailable");
    const effectiveThinking = input.task.thinking ?? ctx.thinkingLevel ?? "off";
    if (model.thinkingLevelMap?.[effectiveThinking] === null) throw new Error("[THINKING_UNSUPPORTED] Thinking level is unsupported");
    const definition = await agentDefinition;
    const delegationId = dependencies.id();
    const record: RecordState = { phase: "queued", childPhase: "queued", unread: false, diagnostics: [] };
    records.set(delegationId, record);
    await updateActivation(true);
    void (async () => {
      let child: ChildSession | undefined;
      try {
        record.childPhase = "setup";
        child = await dependencies.createChild({ cwd: ctx.cwd, task: input.task.task, model, thinking: effectiveThinking, agentDefinition: definition }, modelRuntime);
        let started = false;
        const unsubscribe = child.subscribe((event) => { if (!started && event.type === "agent_start") { started = true; record.phase = "running"; record.childPhase = "running"; } });
        try { await child.prompt(input.task.task, { expandPromptTemplates: false }); } finally { unsubscribe(); }
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
