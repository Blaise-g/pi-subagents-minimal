import { readdir } from "node:fs/promises";
import { cases, type Variant } from "./cases.ts";

const resultsDir = new URL("./results/", import.meta.url).pathname;
const files = (await readdir(resultsDir)).filter((name) => name.endsWith(".jsonl")).sort();

type Row = {
  scenario: string;
  variant: Variant;
  repetition: number;
  passed: number;
  total: number;
  answer: Record<string, string> | null;
};

function finalText(jsonl: string): string | undefined {
  for (const line of jsonl.trim().split("\n").reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
      return event.message.content?.filter((part: any) => part.type === "text").map((part: any) => part.text).join("");
    } catch {}
  }
}

const rows: Row[] = [];
for (const file of files) {
  const match = file.match(/^(.*)--(v1|arhen)--(\d+)\.jsonl$/);
  if (!match) continue;
  const [, id, variantRaw, repetitionRaw] = match;
  const variant = variantRaw as Variant;
  const test = cases.find((item) => item.id === id);
  if (!test) continue;
  const text = finalText(await Bun.file(`${resultsDir}${file}`).text());
  let answer: Record<string, string> | null = null;
  try {
    answer = JSON.parse(text ?? "");
  } catch {}
  const expected = test.expected[variant];
  const passed = Object.entries(expected).filter(([key, value]) => answer?.[key] === value).length;
  rows.push({ scenario: id, variant, repetition: Number(repetitionRaw), passed, total: Object.keys(expected).length, answer });
}

const totals = (variant: Variant) => {
  const selected = rows.filter((row) => row.variant === variant);
  return {
    passed: selected.reduce((sum, row) => sum + row.passed, 0),
    total: selected.reduce((sum, row) => sum + row.total, 0),
  };
};
const v1 = totals("v1");
const arhen = totals("arhen");

const lines = [
  "# Luna operator-comprehension check",
  "",
  "Model: `openai-codex/gpt-5.6-luna`; Thinking level: `medium`; tools/context/extensions disabled.",
  "",
  "The observations are deterministic, source-anchored projections. This checks whether a parent model reads each observable contract correctly; it does not execute either runtime or estimate failure frequency.",
  "",
  `- v1 exact fields: **${v1.passed}/${v1.total}**`,
  `- Arhen exact fields: **${arhen.passed}/${arhen.total}**`,
  "",
  "| Scenario | Variant | Rep | Exact fields | Parsed answer |",
  "|---|---|---:|---:|---|",
  ...rows.map((row) => `| ${row.scenario} | ${row.variant} | ${row.repetition} | ${row.passed}/${row.total} | \`${JSON.stringify(row.answer)}\` |`),
  "",
  "## Interpretation",
  "",
  "Accuracy alone is not the semantic verdict: Luna can often read Arhen's text correctly. The material differences are what the contracts make representable: v1 has `partial` and `timed_out`, queue/setup/run stages, labelled partial results, a non-terminal cancellation phase, and a visible persistence retry path. The out-of-order control guards against claiming an advantage where both contracts are all-settled and input-ordered.",
  "",
];
await Bun.write(`${resultsDir}summary.md`, lines.join("\n"));
console.log(lines.slice(0, 9).join("\n"));
