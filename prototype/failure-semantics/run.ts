import { mkdir, readdir, unlink } from "node:fs/promises";
import { cases, promptFor, type Variant } from "./cases.ts";

const repetitions = Number(process.env.REPETITIONS ?? "2");
const concurrency = Number(process.env.CONCURRENCY ?? "4");
const resultsDir = new URL("./results/", import.meta.url).pathname;
await mkdir(resultsDir, { recursive: true });

const jobs = cases.flatMap((test) =>
  (["v1", "arhen"] as Variant[]).flatMap((variant) =>
    Array.from({ length: repetitions }, (_, repetition) => ({ test, variant, repetition: repetition + 1 })),
  ),
);

async function run(job: (typeof jobs)[number]) {
  const proc = Bun.spawn(
    [
      "pi",
      "--mode", "json",
      "--print",
      "--no-session",
      "--no-tools",
      "--no-context-files",
      "--no-skills",
      "--no-extensions",
      "--model", "openai-codex/gpt-5.6-luna",
      "--thinking", "medium",
      promptFor(job.test, job.variant),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const path = `${resultsDir}${job.test.id}--${job.variant}--${job.repetition}.jsonl`;
  await Bun.write(path, stdout);
  if (exitCode !== 0) throw new Error(`${path}: pi exited ${exitCode}: ${stderr}`);
  console.log(`${job.test.id}/${job.variant}/${job.repetition}`);
}

for (let i = 0; i < jobs.length; i += concurrency) {
  await Promise.all(jobs.slice(i, i + concurrency).map(run));
}

const summary = Bun.spawn(["bun", new URL("./summarize.ts", import.meta.url).pathname], {
  stdout: "inherit",
  stderr: "inherit",
});
const summaryExit = await summary.exited;
if (summaryExit === 0) {
  for (const name of await readdir(resultsDir)) {
    if (!name.endsWith(".jsonl")) continue;
    const path = `${resultsDir}${name}`;
    await Bun.write(`${path}.gz`, Bun.gzipSync(await Bun.file(path).arrayBuffer()));
    await unlink(path);
  }
}
process.exitCode = summaryExit;
