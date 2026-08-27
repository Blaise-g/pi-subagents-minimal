import { writeFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createExtension } from "../src/index.ts";
import { defaultRuntimeDependencies, type ChildSession, type RuntimeDependencies } from "../src/runtime.ts";

interface ObservedChildEvent { batterySource: "child"; childIndex: number; event: unknown }
const childEvents: ObservedChildEvent[] = [];
let nextChildIndex = 0;

export function observeChild(child: ChildSession, childIndex: number, sink: ObservedChildEvent[]): ChildSession {
  const subscribe = child.subscribe.bind(child);
  child.subscribe = (listener) => subscribe((event) => {
    sink.push({ batterySource: "child", childIndex, event });
    listener(event);
  });
  return child;
}

const runtime: RuntimeDependencies = {
  ...defaultRuntimeDependencies,
  async createChild(request, modelRuntime) {
    const childIndex = nextChildIndex++;
    const child = await defaultRuntimeDependencies.createChild(request, modelRuntime);
    return observeChild(child, childIndex, childEvents);
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
