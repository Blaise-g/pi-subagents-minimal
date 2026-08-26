import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event) => {
    const path = process.env.AB_SYSTEM;
    if (path && !existsSync(path)) writeFileSync(path, event.systemPrompt);
  });
  pi.on("before_provider_request", (event) => {
    const path = process.env.AB_PAYLOAD;
    if (path) appendFileSync(path, `${JSON.stringify(event.payload)}\n`);
  });
}
