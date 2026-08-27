import { appendFileSync } from "node:fs";

const output = process.env.CONTEXT_RECORD;
if (!output) throw new Error("CONTEXT_RECORD is required");
const record = (value: unknown) => appendFileSync(output, `${JSON.stringify(value)}\n`);

export default function recorder(pi: any) {
  pi.on("session_start", (_event: unknown, ctx: any) => {
    const requested = process.env.ACTIVE_TOOLS?.split(",").filter(Boolean);
    if (requested) pi.setActiveTools([...new Set([...pi.getActiveTools().filter((name: string) => name !== "delegate" && name !== "delegation_control"), ...requested])]);
    record({ kind: "project", cwd: ctx.cwd });
  });
  pi.on("before_agent_start", (event: any) => record({ kind: "prompt", text: event.systemPrompt }));
  pi.on("before_provider_request", (event: any) => record({ kind: "tools", value: event.payload.tools }));
  pi.on("message_end", (event: any) => {
    if (event.message?.role === "assistant") record({ kind: "tokens", input: event.message.usage?.input });
  });
}
