import { StringEnum } from "@earendil-works/pi-ai";
import { VERSION, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readStartupConfig, type StartupConfig } from "../src/config.ts";
import { defaultRuntimeDependencies, installSuccessfulSingleRuntime, type RuntimeDependencies } from "../src/runtime.ts";

const PI_RANGE = ">=0.84.3 <0.85.0";
const NODE_MINIMUM = [22, 19, 0] as const;
const thinking = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

const task = Type.Object({
  task: Type.String(),
  model: Type.Optional(Type.String()),
  thinking: Type.Optional(StringEnum(thinking)),
  tools: Type.Optional(Type.Array(StringEnum(["git_diff"] as const))),
  reportPath: Type.Optional(Type.String()),
}, { additionalProperties: false });

const delegateParameters = Type.Union([
  Type.Object({ mode: Type.Literal("single"), task }, { additionalProperties: false }),
  Type.Object({ mode: Type.Literal("batch"), tasks: Type.Array(task) }, { additionalProperties: false }),
]);

export interface ExtensionDependencies {
  piVersion: string;
  nodeVersion: string;
  env: Readonly<Record<string, string | undefined>>;
  writeStderr(message: string): void;
  startRuntime?(config: StartupConfig): void;
  runtime: RuntimeDependencies;
}

function parseStableVersion(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function isSupportedHost(piVersion: string, nodeVersion: string): boolean {
  const pi = parseStableVersion(piVersion);
  const node = parseStableVersion(nodeVersion.replace(/^v/, ""));
  return pi !== undefined && node !== undefined
    && compare(pi, [0, 84, 3]) >= 0 && compare(pi, [0, 85, 0]) < 0
    && compare(node, NODE_MINIMUM) >= 0;
}

export function createExtension(overrides: Partial<ExtensionDependencies> = {}) {
  const dependencies: ExtensionDependencies = {
    piVersion: VERSION,
    nodeVersion: process.versions.node,
    env: process.env,
    writeStderr: (message) => process.stderr.write(message),
    runtime: defaultRuntimeDependencies,
    ...overrides,
  };

  return function extension(pi: ExtensionAPI): void {
    if (!isSupportedHost(dependencies.piVersion, dependencies.nodeVersion)) {
      dependencies.writeStderr(`[HOST_UNSUPPORTED] pi-subagents-minimal requires Pi ${PI_RANGE} (stable) and Node >=22.19.0\n`);
      return;
    }

    const configuration = readStartupConfig(dependencies.env);
    let runtimeStarted = false;
    const configError = configuration.ok ? undefined : `[CONFIG_INVALID] ${configuration.message}`;

    const agentDefinition = dependencies.runtime.loadAgent();
    const executeDelegation = configuration.ok
      ? installSuccessfulSingleRuntime(pi, dependencies.runtime, agentDefinition, configuration.value)
      : undefined;

    pi.registerTool({
      name: "delegate",
      label: "Delegate",
      description: "Start one isolated Subagent or a flat batch of independent Subagents in the background. Returns a Delegation id; use delegation_control to inspect or cancel.",
      parameters: delegateParameters,
      async execute(_toolCallId, input, signal, _onUpdate, ctx) {
        if (configError !== undefined) throw new Error(configError);
        return executeDelegation!(input as never, signal ?? new AbortController().signal, ctx);
      },
    });

    if (configuration.ok) {
      pi.on("session_start", async (_event, ctx) => {
        await executeDelegation!.reconstruct(ctx.sessionManager.getBranch());
        if (!runtimeStarted) {
          runtimeStarted = true;
          dependencies.startRuntime?.(configuration.value);
        }
      });
      pi.on("session_shutdown", () => executeDelegation!.shutdown());
    }
  };
}

export default createExtension();
