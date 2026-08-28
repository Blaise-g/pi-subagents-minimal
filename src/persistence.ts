import { createHash } from "node:crypto";
import type { ChildError, ChildOutcome, EffectiveTool, ThinkingLevel, TruncationField } from "./projection.ts";

export type LegacyChildOutcome = Omit<ChildOutcome, "effectiveTools">;
export type LegacyTerminalEnvelope = {
  schemaVersion: 1; delegationId: string; outcome: "succeeded" | "partial" | "failed" | "timed_out" | "cancelled";
  completedAt: string; taskCount: number; order: "input"; children: LegacyChildOutcome[];
};
export type TerminalEnvelopeV2 = {
  schemaVersion: 2; delegationId: string; outcome: "succeeded" | "partial" | "failed" | "timed_out" | "cancelled";
  completedAt: string; taskCount: number; order: "input"; children: ChildOutcome[];
};
export type PersistedTerminalEnvelope = LegacyTerminalEnvelope | TerminalEnvelopeV2;

const idPattern = /^d_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const timestampPattern = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const thinking = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const childOutcomes = new Set(["succeeded", "failed", "timed_out", "cancelled"]);
const parentOutcomes = new Set(["succeeded", "partial", "failed", "timed_out", "cancelled"]);
const legalEffectiveTools: readonly (readonly EffectiveTool[])[] = [
  ["read", "grep", "find", "ls"],
  ["read", "grep", "find", "ls", "write_report"],
];
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => required.every((key) => key in value) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
export const validId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
export const validTimestamp = (value: unknown): value is string => typeof value === "string" && timestampPattern.test(value) && (() => { try { return new Date(value).toISOString() === value; } catch { return false; } })();

function validChild(value: unknown, index: number, version: 1 | 2): value is LegacyChildOutcome | ChildOutcome {
  const required = ["index", "outcome", "effectiveModel", "effectiveThinking", ...(version === 2 ? ["effectiveTools"] : [])];
  if (!object(value) || !exactKeys(value, required, ["result", "report", "partialResult", "error", "truncation"])) return false;
  if (value.index !== index || !childOutcomes.has(value.outcome as string) || typeof value.effectiveModel !== "string" || Buffer.byteLength(value.effectiveModel) > 256 || !thinking.has(value.effectiveThinking as ThinkingLevel)) return false;
  if (value.result !== undefined && typeof value.result !== "string" || value.partialResult !== undefined && typeof value.partialResult !== "string") return false;
  if (value.report !== undefined && (!object(value.report) || !exactKeys(value.report, ["path", "summary"]) || typeof value.report.path !== "string" || typeof value.report.summary !== "string")) return false;
  if (value.error !== undefined && (!object(value.error) || !exactKeys(value.error, ["stage", "code", "message"]) || !["queue", "setup", "run", "projection"].includes(value.error.stage as string) || typeof value.error.code !== "string" || typeof value.error.message !== "string" || Buffer.byteLength(value.error.message) > 512)) return false;
  if (value.truncation !== undefined && (!object(value.truncation) || !exactKeys(value.truncation, ["field", "originalBytes", "retainedBytes"]) || !["result", "report.summary", "partialResult"].includes(value.truncation.field as string) || !Number.isSafeInteger(value.truncation.originalBytes) || !Number.isSafeInteger(value.truncation.retainedBytes))) return false;
  const succeeded = value.outcome === "succeeded";
  if (succeeded && ((value.result !== undefined) === (value.report !== undefined) || value.error !== undefined || value.partialResult !== undefined)) return false;
  if (!succeeded && (value.result !== undefined || value.report !== undefined || value.error === undefined || value.outcome === "cancelled" && value.partialResult !== undefined)) return false;
  if (version === 2) {
    if (!Array.isArray(value.effectiveTools)) return false;
    const effectiveTools = value.effectiveTools;
    if (!legalEffectiveTools.some((tools) => tools.length === effectiveTools.length && tools.every((tool, position) => effectiveTools[position] === tool))) return false;
    const hasReportAuthority = effectiveTools.includes("write_report");
    if (value.outcome === "succeeded" && ((value.report !== undefined) !== hasReportAuthority)) return false;
  }
  return true;
}

export function parseEnvelope(value: unknown): PersistedTerminalEnvelope | undefined {
  if (!object(value) || !exactKeys(value, ["schemaVersion", "delegationId", "outcome", "completedAt", "taskCount", "order", "children"])) return;
  if ((value.schemaVersion !== 1 && value.schemaVersion !== 2) || !validId(value.delegationId) || !parentOutcomes.has(value.outcome as string) || !validTimestamp(value.completedAt) || value.order !== "input" || !Number.isInteger(value.taskCount) || (value.taskCount as number) < 1 || (value.taskCount as number) > 8 || !Array.isArray(value.children) || value.children.length !== value.taskCount || !value.children.every((child, index) => validChild(child, index, value.schemaVersion as 1 | 2))) return;
  const envelope = value as PersistedTerminalEnvelope;
  const variableBytes = envelope.children.reduce((total, child) => total + Buffer.byteLength(child.result ?? child.partialResult ?? "") + (child.report ? Buffer.byteLength(child.report.path) + Buffer.byteLength(child.report.summary) : 0) + (child.truncation ? Buffer.byteLength(JSON.stringify(child.truncation)) : 0), 0);
  if (Buffer.byteLength(JSON.stringify(envelope)) > 32 * 1024 || variableBytes > 24 * 1024 || envelope.children.some((child) => Buffer.byteLength(child.result ?? "") > 16 * 1024 || Buffer.byteLength(child.partialResult ?? "") > 4 * 1024)) return;
  return envelope;
}

export type ConsumptionMarker = { schemaVersion: 1; delegationId: string; envelopeSha256: string; consumedAt: string };
export function parseMarker(value: unknown): ConsumptionMarker | undefined {
  if (!object(value) || !exactKeys(value, ["schemaVersion", "delegationId", "envelopeSha256", "consumedAt"]) || value.schemaVersion !== 1 || !validId(value.delegationId) || typeof value.envelopeSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.envelopeSha256) || !validTimestamp(value.consumedAt) || Buffer.byteLength(JSON.stringify(value)) > 1024) return;
  return value as ConsumptionMarker;
}
export const envelopeDigest = (envelope: PersistedTerminalEnvelope) => createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
