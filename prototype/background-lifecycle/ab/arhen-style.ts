import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type Delegation = { id: string; mode: "single" | "batch"; count: number; phase: "queued" | "running" | "terminal"; outcome?: string };

export default function (pi: ExtensionAPI) {
  let nextId = 1;
  const delegations = new Map<string, Delegation>();
  const get = (id: string) => { const d = delegations.get(id); if (!d) throw new Error(`Unknown Subagent ${id}`); return d; };
  const resultText = (d: Delegation) => d.mode === "batch"
    ? `${d.id} result: ${d.count - 1}/${d.count} succeeded; item ${d.count} failed. Evidence is input ordered.`
    : `${d.id} result: ${d.outcome === "cancelled" ? "cancellation settled" : "cancellation requires settlement before disposal"}.`;
  const announce = (d: Delegation) => pi.sendMessage({ customType: "subagent-complete", content: `${d.id} completed (${d.outcome}).`, display: true }, { deliverAs: "steer", triggerTurn: true });
  const finish = (d: Delegation) => { if (d.phase !== "terminal") { d.phase = "terminal"; d.outcome = d.mode === "batch" ? "mixed" : "succeeded"; announce(d); } };

  pi.registerTool({
    name: "subagent", label: "Subagent", description: "Start one background Subagent or Flat batch and return its id.",
    parameters: Type.Union([
      Type.Object({ mode: Type.Literal("single"), task: Type.String() }),
      Type.Object({ mode: Type.Literal("batch"), tasks: Type.Array(Type.Object({ task: Type.String() }), { minItems: 1, maxItems: 8 }) }),
    ]),
    async execute(_id, params) {
      const id = `S-${String(nextId++).padStart(2, "0")}`;
      delegations.set(id, { id, mode: params.mode, count: params.mode === "batch" ? params.tasks.length : 1, phase: "queued" });
      return { content: [{ type: "text", text: `Started ${id}.` }], details: { id } };
    },
  });
  pi.registerTool({
    name: "subagent_status", label: "Subagent status", description: "Return the current status of a background Subagent.",
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) { const d = get(params.id); return { content: [{ type: "text", text: `${d.id}: ${d.phase}${d.outcome ? ` (${d.outcome})` : ""}` }], details: { phase: d.phase } }; },
  });
  pi.registerTool({
    name: "subagent_result", label: "Subagent result", description: "Retrieve the bounded result of a completed background Subagent.",
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) { const d = get(params.id); if (d.phase !== "terminal") throw new Error(`${d.id} is ${d.phase}`); return { content: [{ type: "text", text: resultText(d) }], details: { outcome: d.outcome } }; },
  });
  pi.registerTool({
    name: "await_subagent", label: "Await Subagent", description: "Wait for a background Subagent to complete, then return its bounded result.",
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) { const d = get(params.id); finish(d); return { content: [{ type: "text", text: resultText(d) }], details: { outcome: d.outcome } }; },
  });
  pi.registerTool({
    name: "subagent_cancel", label: "Cancel Subagent", description: "Cancel a queued or running background Subagent.",
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id, params) { const d = get(params.id); if (d.phase !== "terminal") { d.phase = "terminal"; d.outcome = "cancelled"; announce(d); } return { content: [{ type: "text", text: `${d.id} cancelled.` }], details: { outcome: d.outcome } }; },
  });
  pi.registerTool({
    name: "parent_work", label: "Parent work", description: "Perform an unrelated parent-side step while advancing every fake background Subagent by one lifecycle boundary.",
    parameters: Type.Object({ step: Type.String() }),
    async execute(_id, params) {
      for (const d of delegations.values()) { if (d.phase === "queued") d.phase = "running"; else if (d.phase === "running") finish(d); }
      return { content: [{ type: "text", text: `Parent work completed: ${params.step}` }], details: {} };
    },
  });
}
