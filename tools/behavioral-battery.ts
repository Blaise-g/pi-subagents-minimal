import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export type Thinking = "low" | "medium" | "high";
export interface TrialPlan { id: string; scenario: string; repetition: number; thinking: Thinking; children: number; prompt: string }
export interface TrialRecord extends TrialPlan {
  fixtureCommit: string; provider: string; model: string; piVersion: string; packageVersion: string;
  startedAt: string; wallTimeMs: number; eventStream: unknown[]; terminalEnvelope: unknown;
  usage: { input: number; output: number; total: number }; humanOracle: Record<string, boolean>;
  deterministicPassed: boolean; humanPassed: boolean;
}
interface Manifest { repetitions: number; model: { provider: string; id: string; thinking: Thinking[] }; scenarios: Array<{id: string; children: number; prompt: string}> }

export function buildPlan(manifest: Manifest, levels = manifest.model.thinking, repetitions = manifest.repetitions): TrialPlan[] {
  return levels.flatMap((thinking) => manifest.scenarios.flatMap((scenario) =>
    Array.from({ length: repetitions }, (_, i) => ({
      id: `${scenario.id}--${thinking}--${i + 1}`, scenario: scenario.id,
      repetition: i + 1, thinking, children: scenario.children, prompt: scenario.prompt,
    })),
  ));
}

export function validateRecords(plan: TrialPlan[], records: TrialRecord[]): string[] {
  const errors: string[] = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  if (byId.size !== records.length) errors.push("duplicate trial ids");
  for (const expected of plan) {
    const record = byId.get(expected.id);
    if (!record) { errors.push(`missing ${expected.id}`); continue; }
    for (const key of ["scenario", "repetition", "thinking", "children", "prompt"] as const)
      if (record[key] !== expected[key]) errors.push(`${expected.id}: altered ${key}`);
    if (!record.fixtureCommit || !record.piVersion || !record.packageVersion) errors.push(`${expected.id}: missing version metadata`);
    if (record.provider !== "openai-codex" || record.model !== "gpt-5.6-luna") errors.push(`${expected.id}: unsupported tuple`);
    if (!record.startedAt || record.wallTimeMs < 0 || !Array.isArray(record.eventStream) || !record.terminalEnvelope) errors.push(`${expected.id}: incomplete execution evidence`);
    if (record.usage.total !== record.usage.input + record.usage.output) errors.push(`${expected.id}: invalid usage`);
    if (!record.deterministicPassed || !record.humanPassed || Object.values(record.humanOracle).some((v) => v !== true)) errors.push(`${expected.id}: failed (failures cannot be waived)`);
  }
  for (const record of records) if (!plan.some(({ id }) => id === record.id)) errors.push(`unexpected ${record.id}`);
  return errors;
}

async function main() {
  const root = resolve(import.meta.dir, "..");
  const manifest = JSON.parse(await readFile(resolve(root, "test/behavioral/fixtures/manifest.json"), "utf8")) as Manifest;
  const mode = process.argv[2];
  if (mode === "plan") {
    const levelArg = process.argv.find((arg) => arg.startsWith("--thinking="))?.split("=")[1];
    const levels = levelArg ? [levelArg as Thinking] : manifest.model.thinking;
    const repetitions = process.argv.includes("--sweep") ? 1 : manifest.repetitions;
    const outputArg = process.argv[3]?.startsWith("--") ? undefined : process.argv[3];
    const output = resolve(outputArg ?? "artifacts/behavioral/plan.json");
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ fixtureCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), trials: buildPlan(manifest, levels, repetitions) }, null, 2) + "\n");
    return;
  }
  if (mode === "verify") {
    const input = process.argv[3]; if (!input) throw new Error("usage: behavioral-battery verify <records.json>");
    const records = JSON.parse(await readFile(resolve(input), "utf8")) as TrialRecord[];
    const errors = validateRecords(buildPlan(manifest), records);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`PASS: ${records.length} trials, ${records.reduce((n, r) => n + r.children, 0)} child sessions`);
    return;
  }
  throw new Error("usage: behavioral-battery plan [output] [--thinking=low] [--sweep] | verify <records.json>");
}
if (import.meta.main) await main();
