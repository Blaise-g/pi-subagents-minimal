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
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { StringEnum, type Api, type Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { createReportWriter, validateReportPath, verifyReport, type ReportState } from "./report.ts";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type TaskSpecification = { agent: "investigation"; task: string; model?: string; thinking?: ThinkingLevel; reportPath?: string };
export type ChildRunRequest = { cwd: string; task: string; model: Model<Api>; thinking: ThinkingLevel; agentDefinition: string; customTools?: ToolDefinition[] };
export interface ChildSession { messages: readonly unknown[]; subscribe(listener: (event: { type: string }) => void): () => void; prompt(text: string, options?: { expandPromptTemplates?: boolean }): Promise<void>; dispose(): void; abort(): Promise<void> }
export class ChildSetupError extends Error {
  constructor(readonly code: "RESOURCE_LOAD_FAILED" | "SESSION_CREATE_FAILED") { super(code); }
}

export interface RuntimeDependencies {
  id(): string;
  now(): Date;
  monotonicNow?(): number;
  setTimer?(callback: () => void, milliseconds: number): unknown;
  clearTimer?(handle: unknown): void;
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
    try { await loader.reload(); } catch { throw new ChildSetupError("RESOURCE_LOAD_FAILED"); }
    let session: AgentSession;
    try { ({ session } = await createAgentSession({
      cwd: request.cwd,
      model: request.model,
      thinkingLevel: request.thinking as never,
      modelRuntime,
      tools: request.customTools ? ["read", "grep", "find", "ls", "write_report"] : ["read", "grep", "find", "ls"],
      customTools: request.customTools,
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(request.cwd),
      settingsManager,
    }) as { session: AgentSession }); } catch { throw new ChildSetupError("SESSION_CREATE_FAILED"); }
    return session;
  },
};

type ChildError = { stage: "queue" | "setup" | "run" | "projection"; code: string; message: string };
type ChildOutcome = { index: 0; outcome: "succeeded" | "failed" | "timed_out" | "cancelled"; effectiveModel: string; effectiveThinking: ThinkingLevel; result?: string; report?: { path: string; summary: string }; partialResult?: string; error?: ChildError; truncation?: { field: "result" | "report.summary" | "partialResult"; originalBytes: number; retainedBytes: number } };
type TerminalEnvelope = { schemaVersion: 1; delegationId: string; outcome: ChildOutcome["outcome"]; completedAt: string; taskCount: 1; order: "input"; children: [ChildOutcome] };
type HostDiagnostic = { stage: "cleanup" | "lifecycle" | "persistence"; code: string; message: string; at: string };
type RecordState = { phase: "queued" | "running" | "cancelling" | "finalizing" | "terminal"; childPhase: "queued" | "setup" | "running" | "terminal"; envelope?: TerminalEnvelope; unread: boolean; diagnostics: HostDiagnostic[]; cancel?: () => Promise<void> };

const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8");
function utf8Prefix(value: string, maximum: number): string {
  if (utf8Bytes(value) <= maximum) return value;
  let end = maximum;
  const bytes = Buffer.from(value, "utf8");
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}
const safeMessage = (message: string) => utf8Prefix(message.replace(/(?:[A-Za-z]:)?\/(?:[^\s/]+\/)+[^\s]*/g, "[path]").replace(/(?:authorization|cookie|api[-_]?key|token|headers?)\s*[:=]\s*\S+/gi, "$1=[redacted]"), 512);
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
      if (input.action === "cancel" && record.phase !== "terminal" && record.phase !== "finalizing") await record.cancel?.();
      if (record.phase !== "terminal") return textResult({ schemaVersion: 1, delegationId: input.delegationId, phase: record.phase, children: [{ index: 0, phase: record.childPhase }], diagnostics: record.diagnostics });
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
      if (task.reportPath !== undefined) await validateReportPath(ctx.cwd, task.reportPath);
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
      let unsubscribe: (() => void) | undefined;
      let timer: unknown;
      let settled = false;
      let started = false;
      const setTimer = dependencies.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
      const clearTimer = dependencies.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
      const diagnostic = (code: string, message: string) => {
        record.diagnostics.push({ stage: code.includes("DISPOSE") || code.includes("ABORT") || code.includes("CLEANUP") ? "cleanup" : "lifecycle", code, message: safeMessage(message), at: dependencies.now().toISOString() });
        record.diagnostics = record.diagnostics.slice(-8);
      };
      const finish = async (outcome: ChildOutcome) => {
        if (settled) { diagnostic("LATE_RESULT_REJECTED", "Late settlement evidence was rejected"); return; }
        settled = true;
        if (timer !== undefined) clearTimer(timer);
        unsubscribe?.(); unsubscribe = undefined;
        if (outcome.outcome !== "succeeded") void child?.abort().catch(() => diagnostic("CHILD_ABORT_FAILED", "Subagent abort failed"));
        try { child?.dispose(); } catch { diagnostic("CHILD_DISPOSE_FAILED", "Subagent session disposal failed"); }
        child = undefined;
        record.childPhase = "terminal"; record.phase = "finalizing";
        const envelope: TerminalEnvelope = { schemaVersion: 1, delegationId, outcome: outcome.outcome, completedAt: dependencies.now().toISOString(), taskCount: 1, order: "input", children: [outcome] };
        try { pi.appendEntry("pi-subagents-minimal:terminal", envelope); }
        catch { record.diagnostics.push({ stage: "persistence", code: "TERMINAL_PERSIST_FAILED", message: "Terminal envelope persistence failed", at: dependencies.now().toISOString() }); return; }
        record.envelope = envelope; record.phase = "terminal"; record.unread = true;
        await updateActivation(true);
        try { pi.sendMessage({ customType: "pi-subagents-minimal:completion", content: `Delegation ${delegationId} completed: ${envelope.outcome}. Use delegation_control inspect to retrieve it.`, display: true }, { deliverAs: "steer", triggerTurn: true }); }
        catch { diagnostic("COMPLETION_NOTIFY_FAILED", "Completion notification failed"); }
      };
      const base = (outcome: ChildOutcome["outcome"]): ChildOutcome => ({ index: 0, outcome, effectiveModel: modelName, effectiveThinking });
      const partial = () => { const text = assistantText(child?.messages ?? [])?.text; return text ? utf8Prefix(text, 4096) : undefined; };
      const failure = (stage: ChildError["stage"], code: string, message: string, outcome: "failed" | "timed_out" = "failed"): ChildOutcome => {
        const value = base(outcome); value.error = { stage, code, message: safeMessage(message) }; const text = partial(); if (text) value.partialResult = text; return value;
      };
      record.cancel = async () => {
        if (settled) return;
        record.phase = "cancelling";
        await finish({ ...base("cancelled"), error: { stage: started ? "run" : "setup", code: "CANCELLED", message: "Delegation was cancelled" } });
      };
      try {
        const reportState: ReportState = { written: false, failed: false };
        const customTools = task.reportPath === undefined ? undefined : [createReportWriter(ctx.cwd, task.reportPath, reportState, diagnostic)];
        record.childPhase = "setup";
        timer = setTimer(() => void finish(failure("setup", "SETUP_TIMEOUT", "Setup deadline expired", "timed_out")), config.setupTimeoutMs);
        try { child = await dependencies.createChild({ cwd: ctx.cwd, task: task.task, model, thinking: effectiveThinking, agentDefinition: definition, customTools }, modelRuntime); }
        catch (error) { const code = error instanceof ChildSetupError ? error.code : "SESSION_CREATE_FAILED"; await finish(failure("setup", code, code === "RESOURCE_LOAD_FAILED" ? "Subagent resources failed to load" : "Subagent session creation failed")); return; }
        const boundary = child.messages.length;
        unsubscribe = child.subscribe((event) => {
          if (!started && !settled && event.type === "agent_start") {
            started = true; clearTimer(timer); record.phase = "running"; record.childPhase = "running";
            timer = setTimer(() => void finish(failure("run", "RUN_TIMEOUT", "Running deadline expired", "timed_out")), config.runTimeoutMs);
          }
        });
        try { await child.prompt(task.task, { expandPromptTemplates: false }); }
        catch { await finish(failure(started ? "run" : "setup", started ? "RUN_FAILED" : "PROMPT_REJECTED", started ? "Subagent run failed" : "Prompt was rejected")); return; }
        if (settled) return;
        if (!started) { await finish(failure("setup", "PROMPT_REJECTED", "Prompt resolved before the Subagent started")); return; }
        let answer: ReturnType<typeof assistantText>;
        try { answer = assistantText(child.messages.slice(boundary)); } catch { await finish(failure("projection", "PROJECTION_FAILED", "Subagent output projection failed")); return; }
        if (!answer?.text || !answer.stopReason || answer.stopReason === "toolUse") { await finish(failure("projection", "OUTPUT_MISSING", "Subagent produced no usable output")); return; }
        if (answer.stopReason === "length") { await finish(failure("run", "OUTPUT_LENGTH", "Subagent output reached its length limit")); return; }
        if (answer.stopReason !== "stop") { await finish(failure("run", "RUN_FAILED", "Subagent run did not complete successfully")); return; }
        if (task.reportPath !== undefined) {
          if (!reportState.written || !await verifyReport(ctx.cwd, task.reportPath)) {
            await finish(failure(reportState.failed ? "run" : "projection", reportState.failed ? "REPORT_WRITE_FAILED" : "REPORT_MISSING", reportState.failed ? "The declared report write failed" : "The declared report is missing or unsafe")); return;
          }
          const summary = utf8Prefix(answer.text, 16 * 1024);
          const success: ChildOutcome = { ...base("succeeded"), report: { path: task.reportPath, summary } };
          if (utf8Bytes(summary) < utf8Bytes(answer.text)) success.truncation = { field: "report.summary", originalBytes: utf8Bytes(answer.text), retainedBytes: utf8Bytes(summary) };
          await finish(success); return;
        }
        const result = utf8Prefix(answer.text, 16 * 1024);
        const success: ChildOutcome = { ...base("succeeded"), result };
        if (utf8Bytes(result) < utf8Bytes(answer.text)) success.truncation = { field: "result", originalBytes: utf8Bytes(answer.text), retainedBytes: utf8Bytes(result) };
        await finish(success);
      } finally {
        unsubscribe?.();
        try { child?.dispose(); } catch { diagnostic("CHILD_DISPOSE_FAILED", "Subagent session disposal failed"); }
        child = undefined; unsubscribe = undefined; record.cancel = undefined;
      }
    })();
    return textResult({ schemaVersion: 1, delegationId, phase: "queued", taskCount: 1 });
  };
}
