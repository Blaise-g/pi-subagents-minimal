import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

type Phase = "queued" | "running" | "terminal";
type Delegation = { id: string; mode: "single" | "batch"; count: number; phase: Phase; outcome?: string; read: boolean };

export default function (pi: ExtensionAPI) {
  let nextId = 1;
  const delegations = new Map<string, Delegation>();
  const controlNeeded = () => [...delegations.values()].some((d) => d.phase !== "terminal" || !d.read);
  const syncTools = () => {
    const active = pi.getActiveTools().filter((name) => name !== "delegation_control");
    pi.setActiveTools(controlNeeded() ? [...new Set([...active, "delegation_control"])] : active);
  };
  const announce = (d: Delegation) => pi.sendMessage({
    customType: "delegation-complete",
    content: `${d.id} became terminal (${d.outcome}). Use delegation_control inspect to retrieve its bounded result.`,
    display: true,
  }, { deliverAs: "steer", triggerTurn: true });

  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: "Start one isolated Subagent or one Flat batch in the background. Returns one Delegation id immediately.",
    parameters: Type.Union([
      Type.Object({ mode: Type.Literal("single"), task: Type.String() }),
      Type.Object({ mode: Type.Literal("batch"), tasks: Type.Array(Type.Object({ task: Type.String() }), { minItems: 1, maxItems: 8 }) }),
    ]),
    async execute(_id, params) {
      const id = `D-${String(nextId++).padStart(2, "0")}`;
      delegations.set(id, { id, mode: params.mode, count: params.mode === "batch" ? params.tasks.length : 1, phase: "queued", read: false });
      syncTools();
      return { content: [{ type: "text", text: `${id} accepted in queued state. delegation_control is now active.` }], details: { id, phase: "queued" } };
    },
  });

  pi.registerTool({
    name: "delegation_control",
    label: "Delegation control",
    description: "Inspect one Delegation's observed phase or retrieve its bounded terminal result; or cancel the whole Delegation.",
    parameters: Type.Object({ action: StringEnum(["inspect", "cancel"] as const), id: Type.String() }),
    async execute(_id, params) {
      const d = delegations.get(params.id);
      if (!d) throw new Error(`Unknown Delegation ${params.id}`);
      if (params.action === "cancel") {
        if (d.phase !== "terminal") { d.phase = "terminal"; d.outcome = "cancelled"; announce(d); }
        return { content: [{ type: "text", text: `${d.id} is terminal (${d.outcome}).` }], details: { phase: d.phase, outcome: d.outcome } };
      }
      if (d.phase !== "terminal") return { content: [{ type: "text", text: `${d.id} is ${d.phase}; no progress is inferred.` }], details: { phase: d.phase } };
      d.read = true;
      const text = d.mode === "batch"
        ? `${d.id} bounded terminal result: ${d.count - 1}/${d.count} succeeded; item ${d.count} failed. Evidence is input ordered.`
        : `${d.id} bounded terminal result: ${d.outcome === "cancelled" ? "cancellation settled" : "cancellation requires settlement before disposal"}.`;
      syncTools();
      return { content: [{ type: "text", text }], details: { phase: "terminal", outcome: d.outcome } };
    },
  });

  pi.registerTool({
    name: "parent_work",
    label: "Parent work",
    description: "Perform an unrelated parent-side step while advancing every fake background Delegation by one observed lifecycle boundary.",
    parameters: Type.Object({ step: Type.String() }),
    async execute(_id, params) {
      for (const d of delegations.values()) {
        if (d.phase === "queued") d.phase = "running";
        else if (d.phase === "running") {
          d.phase = "terminal";
          d.outcome = d.mode === "batch" ? "mixed" : "succeeded";
          announce(d);
        }
      }
      return { content: [{ type: "text", text: `Parent work completed: ${params.step}` }], details: {} };
    },
  });

  pi.on("session_start", syncTools);
  pi.on("session_shutdown", () => { for (const d of delegations.values()) if (d.phase !== "terminal") { d.phase = "terminal"; d.outcome = "cancelled"; } });
}
