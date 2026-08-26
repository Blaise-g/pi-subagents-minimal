import { StringEnum } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Outcome = "succeeded" | "failed" | "cancelled";
type Record = {
  id: string;
  phase: "starting" | "running" | "cancelling" | "terminal";
  outcome?: Outcome;
  text?: string;
  read: boolean;
  controller: AbortController;
  session?: AgentSession;
};

export default function (pi: ExtensionAPI) {
  let nextId = 1;
  let modelRuntimePromise: Promise<ModelRuntime> | undefined;
  const records = new Map<string, Record>();
  const runtime = () => modelRuntimePromise ??= ModelRuntime.create();
  const controlNeeded = () => [...records.values()].some((r) => r.phase !== "terminal" || !r.read);
  const syncTools = () => {
    const active = pi.getActiveTools().filter((name) => name !== "delegation_control");
    pi.setActiveTools(controlNeeded() ? [...new Set([...active, "delegation_control"])] : active);
  };
  const announce = (r: Record) => pi.sendMessage({
    customType: "delegation-complete",
    content: `${r.id} became terminal (${r.outcome}). Use delegation_control inspect to retrieve its bounded result.`,
    display: true,
  }, { deliverAs: "steer", triggerTurn: true });

  async function run(r: Record, input: { task: string; cwd: string; model: string; thinking: "off"|"minimal"|"low"|"medium"|"high"|"xhigh"|"max" }) {
    let unsubscribe: (() => void) | undefined;
    try {
      const slash = input.model.indexOf("/");
      if (slash < 1) throw new Error("model must be provider/model-id");
      const modelRuntime = await runtime();
      r.controller.signal.throwIfAborted();
      const model = modelRuntime.getModel(input.model.slice(0, slash), input.model.slice(slash + 1));
      if (!model) throw new Error(`Unknown model ${input.model}`);
      const loader = new DefaultResourceLoader({
        cwd: input.cwd,
        agentDir: getAgentDir(),
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPromptOverride: () => "You are a bounded read-only Investigation Subagent. Answer only the assigned question, cite repository paths, and do not delegate.",
      });
      await loader.reload();
      r.controller.signal.throwIfAborted();
      const { session } = await createAgentSession({
        cwd: input.cwd,
        modelRuntime,
        model,
        thinkingLevel: input.thinking,
        tools: ["read", "grep", "find", "ls"],
        resourceLoader: loader,
        sessionManager: SessionManager.inMemory(input.cwd),
        settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 2 } }),
      });
      r.session = session;
      const abort = () => void session.abort();
      r.controller.signal.addEventListener("abort", abort, { once: true });
      unsubscribe = session.subscribe(() => {});
      r.phase = "running";
      await session.prompt(input.task);
      const final = [...session.messages].reverse().find((m: any) => m.role === "assistant") as any;
      const text = final?.content?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") || final?.errorMessage || "(no result)";
      r.text = Buffer.from(text, "utf8").subarray(0, 24 * 1024).toString("utf8");
      r.outcome = final?.stopReason === "aborted" || r.controller.signal.aborted ? "cancelled" : final?.stopReason === "error" ? "failed" : "succeeded";
    } catch (error) {
      r.outcome = r.controller.signal.aborted ? "cancelled" : "failed";
      r.text = error instanceof Error ? (error.stack ?? error.message) : String(error);
    } finally {
      r.phase = "terminal";
      unsubscribe?.();
      if (r.session) { if (r.session.isStreaming) await r.session.abort(); r.session.dispose(); delete r.session; }
      announce(r);
      syncTools();
    }
  }

  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: "Start one isolated read-only Investigation in the background and immediately return its Delegation id.",
    parameters: Type.Object({
      task: Type.String(),
      model: Type.String({ description: "Exact provider/model-id" }),
      thinking: StringEnum(["off","minimal","low","medium","high","xhigh","max"] as const),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      const id = `D-${String(nextId++).padStart(2, "0")}`;
      const record: Record = { id, phase: "starting", read: false, controller: new AbortController() };
      records.set(id, record);
      syncTools();
      void run(record, { ...params, cwd: ctx.cwd });
      return { content: [{ type: "text", text: `${id} accepted in starting state; delegation_control is active.` }], details: { id, phase: "starting" } };
    },
  });

  pi.registerTool({
    name: "delegation_control",
    label: "Delegation control",
    description: "Inspect one Delegation's observed phase or bounded terminal result, or cancel the whole Delegation.",
    parameters: Type.Object({ action: StringEnum(["inspect", "cancel"] as const), id: Type.String() }),
    async execute(_id, params) {
      const r = records.get(params.id);
      if (!r) throw new Error(`Unknown Delegation ${params.id}`);
      if (params.action === "cancel" && r.phase !== "terminal") {
        r.phase = "cancelling";
        r.controller.abort();
        if (r.session) await r.session.abort();
        return { content: [{ type: "text", text: `${r.id} cancellation requested; settlement is pending.` }], details: { phase: r.phase } };
      }
      if (r.phase !== "terminal") return { content: [{ type: "text", text: `${r.id} is ${r.phase}; no progress is inferred.` }], details: { phase: r.phase } };
      r.read = true;
      syncTools();
      return { content: [{ type: "text", text: `${r.id} ${r.outcome}: ${r.text}` }], details: { phase: r.phase, outcome: r.outcome } };
    },
  });

  pi.on("session_start", syncTools);
  pi.on("session_shutdown", async () => {
    for (const r of records.values()) if (r.phase !== "terminal") r.controller.abort();
    await Promise.allSettled([...records.values()].map((r) => r.session?.abort()));
    for (const r of records.values()) r.session?.dispose();
  });
}
