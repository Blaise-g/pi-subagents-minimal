import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const Task = Type.Object({ task: Type.String() });
const BatchTask = Type.Object({ task: Type.String() });

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "delegate",
    label: "Delegate",
    description: "Run one isolated Subagent or one Flat batch and wait for its bounded terminal result. Cancellation is the active tool call's cancellation signal.",
    parameters: Type.Union([
      Type.Object({ mode: Type.Literal("single"), ...Task.properties }),
      Type.Object({ mode: Type.Literal("batch"), tasks: Type.Array(BatchTask, { minItems: 1, maxItems: 8 }) }),
    ]),
    async execute(_id, params, signal) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 180);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Delegation cancelled")); }, { once: true });
      });
      const count = params.mode === "batch" ? params.tasks.length : 1;
      return {
        content: [{ type: "text", text: params.mode === "batch"
          ? `Terminal Flat-batch result: ${count - 1}/${count} succeeded; item ${count} failed. Evidence is input ordered.`
          : "Terminal Investigation result: cancellation requires settlement before disposal." }],
        details: { status: "terminal", outcome: params.mode === "batch" ? "mixed" : "succeeded" },
      };
    },
  });
  pi.registerTool({
    name: "parent_work",
    label: "Parent work",
    description: "Perform the unrelated parent-side step named by the experiment scenario.",
    parameters: Type.Object({ step: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: `Parent work completed: ${params.step}` }], details: {} };
    },
  });
}
