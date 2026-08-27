import { describe, expect, test } from "bun:test";
import { readStartupConfig } from "../src/config.ts";

const variables = [
  "PI_SUBAGENTS_MINIMAL_CONCURRENCY",
  "PI_SUBAGENTS_MINIMAL_QUEUE_TIMEOUT_MS",
  "PI_SUBAGENTS_MINIMAL_SETUP_TIMEOUT_MS",
  "PI_SUBAGENTS_MINIMAL_RUN_TIMEOUT_MS",
  "PI_SUBAGENTS_MINIMAL_CANCEL_TIMEOUT_MS",
  "PI_SUBAGENTS_MINIMAL_SHUTDOWN_GRACE_MS",
];

describe("startup configuration", () => {
  test("uses the contract defaults", () => {
    expect(readStartupConfig({})).toEqual({ ok: true, value: {
      concurrency: 4, queueTimeoutMs: 300_000, setupTimeoutMs: 30_000,
      runTimeoutMs: 900_000, cancelTimeoutMs: 30_000, shutdownGraceMs: 30_000,
    }});
  });

  test.each([" 4", "+4", "4.0", "4e0", "04", "Infinity", "", "0", "5"])(
    "rejects non-canonical or out-of-range concurrency %p",
    (value) => expect(readStartupConfig({ [variables[0]!]: value }).ok).toBe(false),
  );

  test("accepts every inclusive boundary", () => {
    const minimums = ["1", "1000", "1000", "1000", "1000", "1000"];
    const maximums = ["4", "1800000", "300000", "7200000", "120000", "120000"];
    expect(readStartupConfig(Object.fromEntries(variables.map((key, i) => [key, minimums[i]]))).ok).toBe(true);
    expect(readStartupConfig(Object.fromEntries(variables.map((key, i) => [key, maximums[i]]))).ok).toBe(true);
  });
});
