import { writeFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createExtension } from "../src/index.ts";
import { defaultRuntimeDependencies, type RuntimeDependencies } from "../src/runtime.ts";

interface ObservedChildEvent { batterySource: "child"; childIndex: number; event: unknown }
const childEvents: ObservedChildEvent[] = [];
let nextChildIndex = 0;

const runtime: RuntimeDependencies = {
  ...defaultRuntimeDependencies,
  async createChild(request, modelRuntime) {
    const childIndex = nextChildIndex++;
    const child = await defaultRuntimeDependencies.createChild(request, modelRuntime);
    child.subscribe((event) => childEvents.push({ batterySource: "child", childIndex, event }));
    return child;
  },
};

export default function behavioralObserver(pi: ExtensionAPI): void {
  createExtension({ runtime })(pi);
  pi.on("session_shutdown", async () => {
    const output = process.env.PI_SUBAGENTS_BATTERY_CHILD_EVENTS;
    if (!output) throw new Error("PI_SUBAGENTS_BATTERY_CHILD_EVENTS is required by the Behavioral observer");
    await writeFile(output, JSON.stringify(childEvents) + "\n", { flag: "wx" });
  });
}
