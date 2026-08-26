import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.argv[2] ?? "results";
const logs = readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort();
type Row = { variant:string; scenario:string; initialSchema:number; maxSchema:number; promptChars:number; turns:number; input:number; output:number; calls:string[]; final:string };
const rows: Row[] = [];

for (const name of logs) {
  const stem = basename(name, ".jsonl");
  const [variant, scenario] = stem.split("--");
  const events = readFileSync(join(dir, name), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const payloads = readFileSync(join(dir, `${stem}.payload.json`), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const schemaBytes = payloads.map((p) => Buffer.byteLength(JSON.stringify(p.tools ?? []), "utf8"));
  const assistants = events.filter((e) => e.type === "message_end" && e.message?.role === "assistant").map((e) => e.message);
  const calls = events.filter((e) => e.type === "tool_execution_start").map((e) => e.toolName as string);
  const finalMessage = [...assistants].reverse().find((m) => m.content?.some((p:any) => p.type === "text"));
  const final = finalMessage?.content?.filter((p:any) => p.type === "text").map((p:any) => p.text).join(" ") ?? "";
  rows.push({
    variant, scenario,
    initialSchema: schemaBytes[0] ?? 0,
    maxSchema: Math.max(...schemaBytes, 0),
    promptChars: readFileSync(join(dir, `${stem}.system.txt`), "utf8").length,
    turns: assistants.length,
    input: assistants.reduce((n,m) => n + (m.usage?.input ?? 0), 0),
    output: assistants.reduce((n,m) => n + (m.usage?.output ?? 0), 0),
    calls, final: final.replace(/\s+/g," ").trim(),
  });
}

console.log("# Normalized lifecycle A/B/C results\n");
console.log("Parent model: `openai-codex/gpt-5.6-luna`, medium Thinking level. Child execution is deterministic and fake so this compares parent-facing contracts, not runtime implementations. One stochastic run per cell; directional only.\n");
console.log("| Variant | Scenario | Initial / max tool bytes | Turns | Input / output tokens | Tool sequence |");
console.log("|---|---|---:|---:|---:|---|");
for (const r of rows) console.log(`| ${r.variant} | ${r.scenario} | ${r.initialSchema.toLocaleString()} / ${r.maxSchema.toLocaleString()} | ${r.turns} | ${r.input.toLocaleString()} / ${r.output.toLocaleString()} | ${r.calls.map(c=>`\`${c}\``).join(" → ")} |`);
console.log("\n## Final model verdicts\n");
for (const r of rows) console.log(`- **${r.variant} / ${r.scenario}:** ${r.final || "_(no final text)_"}`);
console.log("\n## Directional findings\n\n- Official-style foreground return was cheapest, but it could not overlap work or support queued/running cancellation. Luna sometimes described cancellation as if it happened despite having no cancellation operation, which strengthens the case for an explicit background contract.\n- Minimal and reduced-Arhen background variants took the same number of turns in every matched scenario and had near-identical total input usage within stochastic noise.\n- Minimal exposed roughly half the stable tool-schema bytes of reduced Arhen and represented queued/running cancellation correctly in the final verdicts.\n- Completion must be delivered as a steering message before the next provider request. A first run using queued follow-up delivery produced stale notifications, duplicate launches, and repeated retrieval after the dynamic control tool had disappeared.\n\n## Interpretation limits\n\n- This is a contract-shape prototype, not reliability or adoption evidence.\n- The official-style variant normalizes Pi’s foreground behavior but does not copy its subprocess runtime.\n- The reduced Arhen-style variant copies lifecycle shape, not Arhen’s implementation or persistence.\n- Token totals include repeated provider calls and therefore reflect both schema shape and the model’s chosen interaction path.\n");
