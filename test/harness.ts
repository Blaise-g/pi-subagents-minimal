import { createEventBus, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

export interface ControlledCollaborators {
  now: () => number;
  persistence: unknown;
  childSession: unknown;
  settlement: unknown;
}

export async function loadExtensionHarness(
  extensionPath: string,
  collaborators: Partial<ControlledCollaborators> = {},
) {
  const controlled: ControlledCollaborators = {
    now: () => 0,
    persistence: {},
    childSession: {},
    settlement: {},
    ...collaborators,
  };
  const eventBus = createEventBus();
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: process.cwd(),
    eventBus,
    additionalExtensionPaths: [extensionPath],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  if (loaded.errors.length > 0) throw new Error(loaded.errors.map((error) => error.error).join("\n"));
  return { extension: loaded.extensions[0]!, eventBus, runtime: loaded.runtime, controlled };
}
