import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const rows = readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort().map((name) => {
  const messages = readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((event) => event.type === "message_end");
  const totals = { input: 0, cacheRead: 0, output: 0, reasoning: 0, totalTokens: 0, cost: 0 };
  for (const event of messages) {
    const usage = event.message?.usage ?? {};
    totals.input += usage.input ?? 0;
    totals.cacheRead += usage.cacheRead ?? 0;
    totals.output += usage.output ?? 0;
    totals.reasoning += usage.reasoning ?? 0;
    totals.totalTokens += usage.totalTokens ?? 0;
    totals.cost += usage.cost?.total ?? 0;
  }
  const secondsPath = join(dir, `${name}.seconds`);
  const seconds = Number(readFileSync(secondsPath, "utf8").trim());
  const [level, id] = name.replace(/\.jsonl$/, "").split("--", 2);
  const last = messages.at(-1)?.message;
  const officialApiEquivalent = (totals.input * 0.20 + totals.cacheRead * 0.02 + totals.output * 1.20) / 1_000_000;
  return { level, id, seconds, stopReason: last?.stopReason ?? "missing", officialApiEquivalent, ...totals };
});
const sum = (key: keyof typeof rows[number]) => rows.reduce((total, row) => total + Number(row[key]), 0);
const observed = { runs: rows.length, input: sum("input"), cacheRead: sum("cacheRead"), output: sum("output"), reasoning: sum("reasoning"), totalTokens: sum("totalTokens"), officialApiEquivalent: sum("officialApiEquivalent"), piRegistryCost: sum("cost"), aggregateSeconds: sum("seconds") };
const projected = Object.fromEntries(Object.entries(observed).map(([key, value]) => [key, key === "runs" ? Number(value) * 3 : Number(value) * 3]));
const table = rows.map((row) => `| ${row.level} | ${row.id} | ${row.input.toLocaleString()} | ${row.cacheRead.toLocaleString()} | ${row.output.toLocaleString()} | ${row.reasoning.toLocaleString()} | ${row.totalTokens.toLocaleString()} | $${row.officialApiEquivalent.toFixed(4)} | ${row.seconds}s | ${row.stopReason} |`).join("\n");
const md = `# Luna quota pilot\n\nOne repetition of all four workflow scenarios at low, medium, and high Thinking. Review and simplification fan out, so 12 workflow trials produce 21 direct Subagent sessions. The frozen 3-repetition matrix projects to 36 workflow trials and 63 Subagent sessions.\n\n| Thinking | Child role | Uncached input | Cached input | Output | Reasoning¹ | Total | API equivalent² | Time | Stop |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n${table}\n\n¹ Reasoning is a subset of output, not an additional billed-token column.  \n² Uses current official Luna rates: $0.20/M uncached input, $0.02/M cached input, and $1.20/M output.\n\n## Observed pilot\n\n- Sessions: ${observed.runs}\n- Uncached input: ${observed.input.toLocaleString()}\n- Cached input: ${observed.cacheRead.toLocaleString()}\n- Output: ${observed.output.toLocaleString()}\n- Reasoning: ${observed.reasoning.toLocaleString()}\n- Provider-reported total tokens: ${observed.totalTokens.toLocaleString()}\n- Official API-equivalent cost: $${observed.officialApiEquivalent.toFixed(4)}\n- Sum of child wall times: ${observed.aggregateSeconds.toLocaleString()} seconds\n\n## Projected complete matrix (3× pilot)\n\n- Sessions: ${projected.runs}\n- Uncached input: ${projected.input.toLocaleString()}\n- Cached input: ${projected.cacheRead.toLocaleString()}\n- Output: ${projected.output.toLocaleString()}\n- Reasoning: ${projected.reasoning.toLocaleString()}\n- Provider-reported total tokens: ${projected.totalTokens.toLocaleString()}\n- Official API-equivalent cost: $${Number(projected.officialApiEquivalent).toFixed(4)}\n- Serial-equivalent child time: ${Number(projected.aggregateSeconds).toLocaleString()} seconds\n\nPi 0.84.3's model registry estimated $${observed.piRegistryCost.toFixed(4)} for the pilot and $${Number(projected.piRegistryCost).toFixed(4)} for the projection, but those values do not reflect current published Luna pricing and are not used.\n\n## Limits\n\nThis measures direct child workloads before the v1 extension exists. It excludes parent-orchestration turns and lifecycle envelopes, and uses a compact seeded fixture. OpenAI Codex OAuth does not expose a subscription-quota meter in Pi's event stream, so tokens, time, and API-equivalent cost are measurable while exact subscription quota units are not.\n`;
writeFileSync(join(dir, "..", "summary.md"), md);
writeFileSync(join(dir, "..", "summary.json"), JSON.stringify({ rows, observed, projected }, null, 2));
console.log(md);
