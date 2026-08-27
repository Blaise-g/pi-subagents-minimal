import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type EvidenceKind = "deterministic" | "packed" | "budget" | "behavioral" | "release" | "typecheck";
export interface EvidenceReference { kind: EvidenceKind; file: string; assertion: string }
interface EvidenceMapping { evidence: string[] }
export interface EvidenceInventory {
  schemaVersion: 1;
  evidenceCatalog: Record<string, EvidenceReference>;
  contractSections: Array<{ section: string } & EvidenceMapping>;
  lifecycleConformance: Array<{ case: string } & EvidenceMapping>;
  packedReleaseGates: Array<{ gate: string } & EvidenceMapping>;
  changeToEvidence: Array<{ assertion: string } & EvidenceMapping>;
}

const evidenceKinds = new Set<EvidenceKind>(["deterministic", "packed", "budget", "behavioral", "release", "typecheck"]);

function contractSections(contract: string): string[] {
  return [...contract.matchAll(/^#{2,3} (\d+(?:\.\d+)?)\.? /gm)].map((match) => match[1]!);
}

function numberedAssertions(contract: string, start: string, end: string): string[] {
  const section = contract.slice(contract.indexOf(start), contract.indexOf(end));
  return section.split("\n").flatMap((line) => {
    const match = /^\d+\. (.+?);?$/.exec(line);
    if (!match) return [];
    const body = match[1]!;
    const bold = /^\*\*([^*]+?)(?::)?\*\*/.exec(body);
    return [(bold?.[1] ?? body).trim()];
  });
}

function changeToEvidenceAssertions(contract: string): string[] {
  const map = contract.slice(contract.indexOf("## 15. Change-to-evidence map"));
  return map.split("\n")
    .filter((line) => /^\| [^|-].*\|$/.test(line))
    .map((line) => line.split("|")[1]!.trim())
    .filter((assertion) => assertion !== "Contract assertion");
}

function compareCoverage(label: string, expected: string[], actual: string[]): string[] {
  const errors: string[] = [];
  const expectedSet = new Set(expected);
  const seen = new Set<string>();
  for (const value of actual) {
    if (seen.has(value)) errors.push(`${label} ${value} is duplicated`);
    else seen.add(value);
    if (!expectedSet.has(value)) errors.push(`${label} ${value} is not in the contract`);
  }
  for (const value of expected) if (!seen.has(value)) errors.push(`${label} ${value} has no evidence`);
  return errors;
}

async function validateReferences(root: string, owner: string, ids: string[], catalog: Record<string, EvidenceReference>): Promise<string[]> {
  if (ids.length === 0) return [`${owner} has no evidence references`];
  const errors: string[] = [];
  for (const id of ids) {
    const reference = catalog[id];
    if (!reference) {
      errors.push(`${owner} refers to unknown evidence ${id}`);
      continue;
    }
    if (!evidenceKinds.has(reference.kind)) errors.push(`${owner} has unknown evidence kind ${reference.kind}`);
    if (reference.assertion.length === 0) errors.push(`${owner} has an empty evidence assertion`);
    try {
      const source = await readFile(resolve(root, reference.file), "utf8");
      if (!source.includes(reference.assertion)) errors.push(`${owner} evidence is stale: ${reference.file} does not contain ${JSON.stringify(reference.assertion)}`);
    } catch {
      errors.push(`${owner} evidence file does not exist: ${reference.file}`);
    }
  }
  return errors;
}

export async function validateEvidenceInventory(root: string, contract: string, inventory: EvidenceInventory): Promise<string[]> {
  if (inventory.schemaVersion !== 1) return ["unsupported evidence inventory schema"];
  const errors = [
    ...compareCoverage("contract section", contractSections(contract), inventory.contractSections.map(({ section }) => section)),
    ...compareCoverage("lifecycle conformance case", numberedAssertions(contract, "### 14.1", "### 14.2"), inventory.lifecycleConformance.map(({ case: name }) => name)),
    ...compareCoverage("packed release gate", numberedAssertions(contract, "### 14.3", "## 15."), inventory.packedReleaseGates.map(({ gate }) => gate)),
    ...compareCoverage("change-to-evidence assertion", changeToEvidenceAssertions(contract), inventory.changeToEvidence.map(({ assertion }) => assertion)),
  ];
  for (const entry of inventory.contractSections)
    errors.push(...await validateReferences(root, `contract section ${entry.section}`, entry.evidence, inventory.evidenceCatalog));
  for (const entry of inventory.lifecycleConformance)
    errors.push(...await validateReferences(root, `lifecycle conformance case ${entry.case}`, entry.evidence, inventory.evidenceCatalog));
  for (const entry of inventory.packedReleaseGates)
    errors.push(...await validateReferences(root, `packed release gate ${entry.gate}`, entry.evidence, inventory.evidenceCatalog));
  for (const entry of inventory.changeToEvidence)
    errors.push(...await validateReferences(root, `change-to-evidence assertion ${entry.assertion}`, entry.evidence, inventory.evidenceCatalog));
  return errors;
}

export interface ReleaseIdentity { version: string; refType: string; refName: string; dirty: boolean }
export function validateReleaseIdentity(identity: ReleaseIdentity): string[] {
  const errors: string[] = [];
  if (identity.refType !== "tag") errors.push("release ref must be a tag");
  if (identity.refName !== `v${identity.version}`) errors.push(`tag ${identity.refName} does not match package version ${identity.version}`);
  if (identity.dirty) errors.push("release checkout is dirty");
  return errors;
}

export interface QualificationRecord { platform: string; piVersion: string; nodeVersion: string; bunVersion: string }
export interface ReleaseRecordInput {
  packageVersion: string;
  commit: string;
  tag: string;
  tarballSha256: string;
  qualifications: QualificationRecord[];
  workflow: { repository: string; runId: string; runAttempt: string };
}

export function buildReleaseRecord(input: ReleaseRecordInput) {
  return {
    schemaVersion: 1 as const,
    package: { name: "pi-subagents-minimal", version: input.packageVersion },
    source: { commit: input.commit, tag: input.tag },
    tarball: { sha256: input.tarballSha256 },
    qualifications: [...input.qualifications].sort((a, b) => `${a.platform}\0${a.piVersion}\0${a.nodeVersion}\0${a.bunVersion}`.localeCompare(`${b.platform}\0${b.piVersion}\0${b.nodeVersion}\0${b.bunVersion}`)),
    workflow: input.workflow,
  };
}

async function verifyInventory(root: string): Promise<void> {
  const contract = await readFile(resolve(root, "docs/spec/v1-implementation-contract.md"), "utf8");
  const inventory = JSON.parse(await readFile(resolve(root, "docs/release-evidence.json"), "utf8")) as EvidenceInventory;
  const errors = await validateEvidenceInventory(root, contract, inventory);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  console.log(`Verified ${inventory.contractSections.length} contract sections, ${inventory.lifecycleConformance.length} lifecycle cases, ${inventory.packedReleaseGates.length} packed gates, and ${inventory.changeToEvidence.length} change-to-evidence assertions.`);
}

async function createRecord(metadataDirectory: string, output: string): Promise<void> {
  const qualifications: QualificationRecord[] = [];
  for (const name of await readdir(metadataDirectory, { recursive: true })) {
    if (!name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(resolve(metadataDirectory, name), "utf8")) as QualificationRecord;
    qualifications.push(value);
  }
  const record = buildReleaseRecord({
    packageVersion: process.env.RELEASE_PACKAGE_VERSION!,
    commit: process.env.RELEASE_COMMIT!,
    tag: process.env.RELEASE_TAG!,
    tarballSha256: process.env.RELEASE_TARBALL_SHA256!,
    qualifications,
    workflow: { repository: process.env.GITHUB_REPOSITORY!, runId: process.env.GITHUB_RUN_ID!, runAttempt: process.env.GITHUB_RUN_ATTEMPT! },
  });
  await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
}

async function smoke(extensionPath: string): Promise<void> {
  const { createEventBus, DefaultResourceLoader } = await import("@earendil-works/pi-coding-agent");
  const eventBus = createEventBus();
  const loader = new DefaultResourceLoader({
    cwd: process.cwd(), agentDir: process.cwd(), eventBus,
    additionalExtensionPaths: [resolve(extensionPath)],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  if (loaded.errors.length > 0) throw new Error(loaded.errors.map(({ error }) => error).join("\n"));
  if (loaded.extensions.length !== 1) throw new Error(`expected one extension, got ${loaded.extensions.length}`);
  const names = [...loaded.extensions[0]!.tools.keys()].sort();
  if (JSON.stringify(names) !== JSON.stringify(["delegation_control", "delegate"])) throw new Error(`unexpected tools: ${names.join(", ")}`);
  console.log("Packed smoke passed: delegate plus inactive-by-default delegation_control are the only package tools.");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "verify-inventory") await verifyInventory(resolve(args[0] ?? "."));
  else if (command === "verify-identity" && args.length === 4) {
    const errors = validateReleaseIdentity({ version: args[0]!, refType: args[1]!, refName: args[2]!, dirty: args[3] === "true" });
    if (errors.length > 0) throw new Error(errors.join("\n"));
  } else if (command === "create-record" && args[0] && args[1]) await createRecord(args[0], args[1]);
  else if (command === "smoke" && args[0]) await smoke(args[0]);
  else throw new Error("usage: release.ts verify-inventory [root] | verify-identity <version> <ref-type> <ref-name> <dirty> | create-record <metadata-dir> <output> | smoke <extension-path>");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
