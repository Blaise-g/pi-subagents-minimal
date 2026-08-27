export type StartupConfig = Readonly<{
  concurrency: number;
  queueTimeoutMs: number;
  setupTimeoutMs: number;
  runTimeoutMs: number;
  cancelTimeoutMs: number;
  shutdownGraceMs: number;
}>;

const fields = [
  ["PI_SUBAGENTS_MINIMAL_CONCURRENCY", "concurrency", 4, 1, 4],
  ["PI_SUBAGENTS_MINIMAL_QUEUE_TIMEOUT_MS", "queueTimeoutMs", 300_000, 1_000, 1_800_000],
  ["PI_SUBAGENTS_MINIMAL_SETUP_TIMEOUT_MS", "setupTimeoutMs", 30_000, 1_000, 300_000],
  ["PI_SUBAGENTS_MINIMAL_RUN_TIMEOUT_MS", "runTimeoutMs", 900_000, 1_000, 7_200_000],
  ["PI_SUBAGENTS_MINIMAL_CANCEL_TIMEOUT_MS", "cancelTimeoutMs", 30_000, 1_000, 120_000],
  ["PI_SUBAGENTS_MINIMAL_SHUTDOWN_GRACE_MS", "shutdownGraceMs", 30_000, 1_000, 120_000],
] as const;

export type ConfigResult =
  | { ok: true; value: StartupConfig }
  | { ok: false; message: string };

export function readStartupConfig(env: Readonly<Record<string, string | undefined>>): ConfigResult {
  const values: Record<string, number> = {};
  for (const [variable, property, fallback, minimum, maximum] of fields) {
    const raw = env[variable];
    if (raw === undefined) {
      values[property] = fallback;
      continue;
    }
    if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
      return { ok: false, message: `${variable} must be a canonical decimal integer in ${minimum}..${maximum}` };
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      return { ok: false, message: `${variable} must be a canonical decimal integer in ${minimum}..${maximum}` };
    }
    values[property] = value;
  }
  return { ok: true, value: Object.freeze(values) as StartupConfig };
}
