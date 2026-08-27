import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";

export type Thinking = "low" | "medium" | "high";
export interface TrialPlan { id: string; scenario: string; repetition: number; thinking: Thinking; children: number; prompt: string }
export interface TrialRecord extends TrialPlan {
  fixtureCommit: string; provider: string; model: string; piVersion: string; packageVersion: string;
  startedAt: string; wallTimeMs: number; eventStream: unknown[]; terminalEnvelope: unknown;
  usage: { input: number; output: number; total: number }; humanOracle: Record<string, boolean>;
  humanReview: { reviewer: string; reviewedAt: string }; deterministicPassed: boolean; humanPassed: boolean;
}
interface Manifest { repetitions: number; model: { provider: string; id: string; thinking: Thinking[] }; scenarios: Array<{id: string; children: number; prompt: string}> }
type OracleManifest = Record<string, string[] | Record<string, string[]>>;
const oracleManifest = JSON.parse(readFileSync(new URL("../test/behavioral/oracles/v1.json", import.meta.url), "utf8")) as OracleManifest;

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const validDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));
function expectedOracleChecks(scenario: string): string[] {
  const configured = oracleManifest[scenario];
  if (!configured) return [];
  return Array.isArray(configured) ? configured : Object.values(configured).flat();
}
function validEnvelope(value: unknown, expected: TrialPlan): boolean {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.delegationId !== "string" || !/^d_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.delegationId) || value.outcome !== "succeeded" || value.taskCount !== expected.children || value.order !== "input" || !validDate(value.completedAt) || !Array.isArray(value.children) || value.children.length !== expected.children) return false;
  return value.children.every((child, index) => {
    if (!object(child) || child.index !== index || child.outcome !== "succeeded" || child.effectiveModel !== "openai-codex/gpt-5.6-luna" || child.effectiveThinking !== expected.thinking) return false;
    if (expected.scenario === "research") return object(child.report) && child.report.path === "artifacts/session-isolation.md" && typeof child.report.summary === "string" && child.report.summary.length > 0;
    return typeof child.result === "string" && child.result.length > 0;
  });
}
function eventStreamHasPrompt(events: unknown[], prompt: string): boolean {
  return events.some((event) => object(event) && event.type === "agent_end" && Array.isArray(event.messages) && event.messages.some((message) => object(message) && message.role === "user" && Array.isArray(message.content) && message.content.some((part) => object(part) && part.type === "text" && part.text === prompt)));
}
function observedChildEvent(event: unknown): event is { batterySource: "child"; childIndex: number; event: Record<string, unknown> } {
  return object(event) && event.batterySource === "child" && typeof event.childIndex === "number" && object(event.event);
}
function eventStreamHasChildren(events: unknown[], children: number): boolean {
  const observed = events.filter(observedChildEvent);
  if (new Set(observed.map((event) => event.childIndex)).size !== children) return false;
  return Array.from({ length: children }, (_, index) => observed.filter((event) => event.childIndex === index).map((event) => event.event as Record<string, unknown>))
    .every((stream) => stream.some((event) => event.type === "agent_start") && stream.some((event) => event.type === "agent_end"));
}

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
    if (!/^[0-9a-f]{40}$/.test(record.fixtureCommit) || !record.piVersion || !record.packageVersion) errors.push(`${expected.id}: missing version metadata`);
    if (record.provider !== "openai-codex" || record.model !== "gpt-5.6-luna") errors.push(`${expected.id}: unsupported tuple`);
    if (!validDate(record.startedAt) || !Number.isFinite(record.wallTimeMs) || record.wallTimeMs <= 0) errors.push(`${expected.id}: incomplete execution evidence`);
    if (!Array.isArray(record.eventStream) || record.eventStream.length === 0) errors.push(`${expected.id}: empty event stream`);
    else {
      if (!eventStreamHasPrompt(record.eventStream, expected.prompt)) errors.push(`${expected.id}: event stream does not prove exact prompt`);
      if (!eventStreamHasChildren(record.eventStream, expected.children)) errors.push(`${expected.id}: incomplete child event streams`);
    }
    if (!validEnvelope(record.terminalEnvelope, expected)) errors.push(`${expected.id}: invalid Terminal envelope`);
    if (!object(record.usage) || !Number.isFinite(record.usage.input) || !Number.isFinite(record.usage.output) || !Number.isFinite(record.usage.total) || record.usage.input < 0 || record.usage.output < 0 || record.usage.total !== record.usage.input + record.usage.output) errors.push(`${expected.id}: invalid usage`);
    else if (record.usage.total === 0) errors.push(`${expected.id}: empty usage`);
    const expectedChecks = [...expectedOracleChecks(expected.scenario)].sort();
    if (!object(record.humanOracle) || JSON.stringify(Object.keys(record.humanOracle).sort()) !== JSON.stringify(expectedChecks)) errors.push(`${expected.id}: human oracle inventory mismatch`);
    if (!object(record.humanReview) || typeof record.humanReview.reviewer !== "string" || !record.humanReview.reviewer.trim() || !validDate(record.humanReview.reviewedAt)) errors.push(`${expected.id}: missing human reviewer evidence`);
    if (!record.deterministicPassed || !record.humanPassed || !object(record.humanOracle) || Object.values(record.humanOracle).some((v) => v !== true)) errors.push(`${expected.id}: failed (failures cannot be waived)`);
  }
  for (const record of records) if (!plan.some(({ id }) => id === record.id)) errors.push(`unexpected ${record.id}`);
  for (const key of ["fixtureCommit", "piVersion", "packageVersion"] as const)
    if (new Set(records.map((record) => record[key])).size > 1) errors.push(`inconsistent ${key} across trials`);
  if (new Set(records.map((record) => record.humanReview?.reviewer)).size > 1 || new Set(records.map((record) => record.humanReview?.reviewedAt)).size > 1) errors.push("inconsistent human review across trials");
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
