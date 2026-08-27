export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type ChildError = { stage: "queue" | "setup" | "run" | "projection"; code: string; message: string };
export type TruncationField = "result" | "report.summary" | "partialResult";
export type ChildOutcome = {
  index: number;
  outcome: "succeeded" | "failed" | "timed_out" | "cancelled";
  effectiveModel: string;
  effectiveThinking: ThinkingLevel;
  result?: string;
  report?: { path: string; summary: string };
  partialResult?: string;
  error?: ChildError;
  truncation?: { field: TruncationField; originalBytes: number; retainedBytes: number };
};
export type TerminalEnvelope = {
  schemaVersion: 1;
  delegationId: string;
  outcome: "succeeded" | "partial" | "failed" | "timed_out" | "cancelled";
  completedAt: string;
  taskCount: number;
  order: "input";
  children: ChildOutcome[];
};

const RESULT_CAP = 16 * 1024;
const PARTIAL_CAP = 4 * 1024;
const VARIABLE_CAP = 24 * 1024;
const ENVELOPE_CAP = 32 * 1024;
const utf8Bytes = (value: string) => Buffer.byteLength(value, "utf8");
const compactBytes = (value: unknown) => utf8Bytes(JSON.stringify(value));

function prefix(value: string, maximum: number): string {
  if (utf8Bytes(value) <= maximum) return value;
  const bytes = Buffer.from(value, "utf8");
  let end = maximum;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end).toString("utf8");
}

function project(child: ChildOutcome, waterline: number): ChildOutcome {
  const copy: ChildOutcome = {
    index: child.index, outcome: child.outcome, effectiveModel: child.effectiveModel,
    effectiveThinking: child.effectiveThinking,
    ...(child.error ? { error: { ...child.error } } : {}),
  };
  let field: TruncationField | undefined;
  let original: string | undefined;
  let cap = RESULT_CAP;
  if (child.result !== undefined) { field = "result"; original = child.result; }
  else if (child.report !== undefined) { field = "report.summary"; original = child.report.summary; copy.report = { path: child.report.path, summary: "" }; }
  else if (child.partialResult !== undefined) { field = "partialResult"; original = child.partialResult; cap = PARTIAL_CAP; }
  if (field === undefined || original === undefined) return copy;
  const retained = prefix(original, Math.min(waterline, cap));
  if (field === "result") copy.result = retained;
  else if (field === "report.summary") copy.report!.summary = retained;
  else copy.partialResult = retained;
  const originalBytes = utf8Bytes(original);
  const retainedBytes = utf8Bytes(retained);
  if (retainedBytes < originalBytes) copy.truncation = { field, originalBytes, retainedBytes };
  return copy;
}

function variableBytes(children: readonly ChildOutcome[]): number {
  return children.reduce((total, child) => total
    + (child.report ? utf8Bytes(child.report.path) + utf8Bytes(child.report.summary) : 0)
    + utf8Bytes(child.result ?? child.partialResult ?? "")
    + (child.truncation ? compactBytes(child.truncation) : 0), 0);
}

/** Constructs the unique greatest legal common-waterline representation. */
export function allocateTerminalEnvelope(base: Omit<TerminalEnvelope, "children">, outcomes: readonly ChildOutcome[]): TerminalEnvelope {
  for (let waterline = RESULT_CAP; waterline >= 0; waterline--) {
    const children = outcomes.map((outcome) => project(outcome, waterline));
    if (children.some((child) => child.outcome === "succeeded" && child.result !== undefined && child.result.length === 0)) continue;
    const envelope: TerminalEnvelope = { ...base, children };
    if (variableBytes(children) <= VARIABLE_CAP && compactBytes(envelope) <= ENVELOPE_CAP) return envelope;
  }
  throw new Error("TERMINAL_PROJECTION_FAILED");
}

/** Conservative preflight check; callers provide maximum protected metadata and no assumed model output. */
export function terminalEnvelopeFeasible(base: Omit<TerminalEnvelope, "children">, outcomes: readonly ChildOutcome[]): boolean {
  try {
    const children = outcomes.map((outcome) => project(outcome, 0));
    const envelope: TerminalEnvelope = { ...base, children };
    return variableBytes(children) <= VARIABLE_CAP && compactBytes(envelope) <= ENVELOPE_CAP;
  } catch { return false; }
}

export const envelopeUtf8Bytes = (envelope: TerminalEnvelope): number => compactBytes(envelope);
export const terminalEnvelopeWithinLimits = (envelope: TerminalEnvelope): boolean => variableBytes(envelope.children) <= VARIABLE_CAP && compactBytes(envelope) <= ENVELOPE_CAP;
