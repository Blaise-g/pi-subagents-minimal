import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile, execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildPlan, validateRecords, type Thinking, type TrialPlan, type TrialRecord } from "./behavioral-battery.ts";

const exec = promisify(execFile);
const ROOT = resolve(import.meta.dir, "..");
const MANIFEST_PATH = resolve(ROOT, "test/behavioral/fixtures/manifest.json");
const ORACLES_PATH = resolve(ROOT, "test/behavioral/oracles/v1.json");
const REVIEW_SKILLS: Record<string, string> = {
  "diff-review": resolve(ROOT, "test/behavioral/skills/code-review-diff/SKILL.md"),
  simplification: resolve(ROOT, "test/behavioral/skills/code-simplify/SKILL.md"),
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Observation = Omit<TrialRecord, "humanOracle" | "humanReview" | "humanPassed"> & {
  deterministicErrors: string[];
  capturedFiles: Record<string, string>;
  stderr: string;
};
type Scorecard = {
  reviewer: string;
  reviewedAt: string;
  trials: Record<string, { checks: Record<string, boolean | null> }>;
};

type OracleManifest = Record<string, string[] | Record<string, string[]>>;
const parseJson = <T>(text: string): T => JSON.parse(text) as T;
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const observedChildEvent = (value: unknown): value is { batterySource: "child"; childIndex: number; event: Record<string, unknown> } => object(value) && value.batterySource === "child" && typeof value.childIndex === "number" && object(value.event);
const oracleChecks = (oracles: OracleManifest, scenario: string) => {
  const configured = oracles[scenario];
  if (!configured) throw new Error(`missing oracle inventory for ${scenario}`);
  return Array.isArray(configured) ? configured : Object.values(configured).flat();
};

function words(text: string) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
function assistantText(events: unknown[]): string {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (!object(event) || event.type !== "message_end" || !object(event.message) || event.message.role !== "assistant" || !Array.isArray(event.message.content)) continue;
    return event.message.content.filter(object).filter((part) => part.type === "text" && typeof part.text === "string").map((part) => part.text as string).join("");
  }
  return "";
}
function toolCalls(events: unknown[], name: string): Array<Record<string, unknown>> {
  return events.filter(object).filter((event) => event.type === "tool_execution_start" && event.toolName === name && object(event.args)).map((event) => event.args as Record<string, unknown>);
}
function usage(events: unknown[]) {
  let input = 0, output = 0;
  for (const observed of events) {
    const event = object(observed) && observed.batterySource === "child" ? observed.event : observed;
    if (!object(event) || event.type !== "message_end" || !object(event.message) || !object(event.message.usage)) continue;
    input += typeof event.message.usage.input === "number" ? event.message.usage.input : 0;
    output += typeof event.message.usage.output === "number" ? event.message.usage.output : 0;
  }
  return { input, output, total: input + output };
}
function terminalEnvelope(entries: unknown[]): unknown {
  const terminals = entries.filter(object).filter((entry) => entry.type === "custom" && entry.customType === "pi-subagents-minimal:terminal");
  return terminals.length === 1 ? terminals[0]!.data : undefined;
}

export function deterministicErrors(plan: TrialPlan, eventStream: unknown[], envelope: unknown, beforeStatus: string, afterStatus: string, capturedFiles: Record<string, string>): string[] {
  const errors: string[] = [];
  if (!eventStream.some((event) => object(event) && event.type === "agent_start") || !eventStream.some((event) => object(event) && event.type === "agent_end")) errors.push("incomplete parent event stream");
  if (!eventStream.some((event) => object(event) && event.type === "agent_end" && Array.isArray(event.messages) && event.messages.some((message) => object(message) && message.role === "user" && Array.isArray(message.content) && message.content.some((part) => object(part) && part.type === "text" && part.text === plan.prompt)))) errors.push("parent event stream does not prove the exact frozen prompt");
  const childStreams = eventStream.filter(observedChildEvent);
  for (let index = 0; index < plan.children; index++) {
    const events = childStreams.filter((observed) => observed.childIndex === index).map((observed) => observed.event as Record<string, unknown>);
    if (!events.some((event) => event.type === "agent_start") || !events.some((event) => event.type === "agent_end")) errors.push(`incomplete child event stream ${index}`);
  }
  if (new Set(childStreams.map((event) => event.childIndex)).size !== plan.children) errors.push("unexpected observed child event-stream count");
  const calls = toolCalls(eventStream, "delegate");
  if (calls.length !== 1) errors.push("expected exactly one delegate call");
  else {
    const call = calls[0]!;
    const tasks = call.mode === "single" && object(call.task) ? [call.task] : call.mode === "batch" && Array.isArray(call.tasks) ? call.tasks : [];
    if (tasks.length !== plan.children) errors.push(`expected ${plan.children} delegated children`);
    for (const task of tasks) if (!object(task) || task.agent !== "investigation") errors.push("unexpected delegated Agent");
    if (plan.scenario === "research" && (!object(tasks[0]) || tasks[0].reportPath !== "artifacts/session-isolation.md")) errors.push("research did not declare the frozen report path");
  }
  if (!object(envelope) || envelope.schemaVersion !== 1 || typeof envelope.delegationId !== "string" || !envelope.delegationId.startsWith("d_") || envelope.outcome !== "succeeded" || typeof envelope.completedAt !== "string" || Number.isNaN(Date.parse(envelope.completedAt)) || envelope.taskCount !== plan.children || envelope.order !== "input" || !Array.isArray(envelope.children) || envelope.children.length !== plan.children) errors.push("invalid successful Terminal envelope");
  else for (const [index, child] of envelope.children.entries()) {
    if (!object(child) || child.index !== index || child.outcome !== "succeeded" || child.effectiveModel !== "openai-codex/gpt-5.6-luna" || child.effectiveThinking !== plan.thinking) errors.push(`invalid effective tuple or outcome for child ${index}`);
    else if (plan.scenario === "research" ? !object(child.report) || child.report.path !== "artifacts/session-isolation.md" || typeof child.report.summary !== "string" || !child.report.summary : typeof child.result !== "string" || !child.result) errors.push(`invalid projected evidence for child ${index}`);
  }
  const answer = assistantText(eventStream);
  if (!answer) errors.push("missing final parent answer");
  if (plan.scenario === "exploration") {
    if (beforeStatus !== afterStatus) errors.push("exploration modified its fixture");
    if (words(answer) > 180) errors.push("exploration exceeded 180 words");
    if (!/DefaultResourceLoader/u.test(answer) || !/mergePaths/u.test(answer)) errors.push("exploration omitted required cited symbols");
  } else if (plan.scenario === "research") {
    if (!Object.hasOwn(capturedFiles, "artifacts/session-isolation.md")) errors.push("research report was not captured");
    if (!afterStatus.split("\n").some((line) => line.endsWith("artifacts/session-isolation.md"))) errors.push("research did not make exactly the declared report mutation");
    if (afterStatus.split("\n").filter(Boolean).length !== beforeStatus.split("\n").filter(Boolean).length + 1) errors.push("research made an additional mutation");
    if (!/artifacts\/session-isolation\.md/u.test(answer)) errors.push("research summary omitted the report path");
    if (!/:\d+(?:-\d+)?/u.test(capturedFiles["artifacts/session-isolation.md"] ?? "")) errors.push("research report omitted cited line ranges");
  } else if (plan.scenario === "diff-review") {
    if (beforeStatus !== afterStatus) errors.push("diff review modified its fixture");
    const standards = answer.indexOf("## Standards"), spec = answer.indexOf("## Spec");
    if (standards < 0 || spec <= standards) errors.push("diff review did not preserve Standards then Spec aggregation");
  } else if (plan.scenario === "simplification") {
    if (beforeStatus !== afterStatus) errors.push("simplification changed the prepared diff");
    const headings = ["## Reuse", "## Quality", "## Efficiency"].map((heading) => answer.indexOf(heading));
    if (headings.some((index) => index < 0) || !(headings[0]! < headings[1]! && headings[1]! < headings[2]!)) errors.push("simplification did not preserve Reuse, Quality, Efficiency aggregation");
  }
  return [...new Set(errors)];
}

async function status(cwd: string) {
  const { stdout } = await exec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd });
  return stdout.trimEnd();
}
async function prepareWorkspace(plan: TrialPlan, runDir: string, fixtureCommit: string): Promise<{ cwd: string; cleanup(): Promise<void> }> {
  const cwd = resolve(runDir, "workspaces", plan.id);
  await mkdir(dirname(cwd), { recursive: true });
  if (plan.scenario === "exploration" || plan.scenario === "research") {
    await exec("git", ["worktree", "add", "--detach", cwd, fixtureCommit], { cwd: ROOT });
    await mkdir(resolve(cwd, "node_modules/@earendil-works"), { recursive: true });
    await cp(resolve(ROOT, "node_modules/@earendil-works/pi-coding-agent"), resolve(cwd, "node_modules/@earendil-works/pi-coding-agent"), { recursive: true });
    return { cwd, cleanup: async () => { await exec("git", ["worktree", "remove", "--force", cwd], { cwd: ROOT }); } };
  }
  await exec("bash", [resolve(ROOT, "tools/prepare-battery-fixture.sh"), cwd, plan.scenario === "diff-review" ? "committed" : "uncommitted"], { cwd: ROOT });
  return { cwd, cleanup: async () => { await rm(cwd, { recursive: true, force: true }); } };
}
async function readSessionEntries(sessionDir: string): Promise<unknown[]> {
  const names = (await readdir(sessionDir)).filter((name) => name.endsWith(".jsonl"));
  if (names.length !== 1) throw new Error(`expected one session file, found ${names.length}`);
  const text = await readFile(resolve(sessionDir, names[0]!), "utf8");
  return text.trim().split("\n").filter(Boolean).map((line) => parseJson<unknown>(line));
}
async function captureFiles(plan: TrialPlan, cwd: string) {
  const files: Record<string, string> = {};
  if (plan.scenario === "research") {
    const path = "artifacts/session-isolation.md";
    try { files[path] = await readFile(resolve(cwd, path), "utf8"); } catch {}
  }
  return files;
}

async function runTrial(plan: TrialPlan, runDir: string, fixtureCommit: string, piVersion: string, packageVersion: string): Promise<Observation> {
  const observationPath = resolve(runDir, "observations", `${plan.id}.json`);
  try { await readFile(observationPath); throw new Error(`refusing to overwrite observed trial ${plan.id}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const workspace = await prepareWorkspace(plan, runDir, fixtureCommit);
  const sessionDir = resolve(runDir, "sessions", plan.id);
  const childEventsPath = resolve(runDir, "sessions", `${plan.id}-children.json`);
  await mkdir(sessionDir, { recursive: true });
  const beforeStatus = await status(workspace.cwd);
  const expectedInitialStatus = plan.scenario === "simplification" ? " M src/users.ts" : "";
  if (beforeStatus !== expectedInitialStatus) throw new Error(`${plan.id}: prepared fixture has unexpected initial status ${JSON.stringify(beforeStatus)}`);
  const started = new Date();
  const args = ["--mode", "json", "--session-dir", sessionDir, "--provider", "openai-codex", "--model", "gpt-5.6-luna", "--thinking", plan.thinking, "--no-extensions", "-e", resolve(ROOT, "tools/behavioral-observer-extension.ts"), "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--tools", "delegate,delegation_control"];
  const skill = REVIEW_SKILLS[plan.scenario];
  if (skill) args.push("--skill", skill);
  args.push("--", plan.prompt);
  let eventStream: unknown[] = [], stderr = "", exitCode = 0;
  try {
    const result = await exec("pi", args, { cwd: workspace.cwd, env: { ...process.env, PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0", PI_SUBAGENTS_BATTERY_CHILD_EVENTS: childEventsPath }, maxBuffer: 64 * 1024 * 1024 });
    stderr = result.stderr;
    eventStream = result.stdout.trim().split("\n").filter(Boolean).map((line) => parseJson<unknown>(line));
  } catch (error) {
    const failed = error as Error & { code?: number; stdout?: string; stderr?: string };
    exitCode = typeof failed.code === "number" ? failed.code : 1;
    stderr = failed.stderr ?? failed.message;
    eventStream = (failed.stdout ?? "").trim().split("\n").filter(Boolean).map((line) => parseJson<unknown>(line));
  }
  try {
    const childEvents = parseJson<unknown>(await readFile(childEventsPath, "utf8"));
    if (Array.isArray(childEvents)) eventStream.push(...childEvents);
    else stderr += "\nBehavioral child-event evidence was not an array";
  } catch (error) { stderr += `\nCould not read Behavioral child-event evidence: ${String(error)}`; }
  const afterStatus = await status(workspace.cwd);
  const capturedFiles = await captureFiles(plan, workspace.cwd);
  let envelope: unknown;
  try { envelope = terminalEnvelope(await readSessionEntries(sessionDir)); } catch (error) { stderr += `\n${String(error)}`; }
  const errors = deterministicErrors(plan, eventStream, envelope, beforeStatus, afterStatus, capturedFiles);
  if (exitCode !== 0) errors.push(`pi exited with status ${exitCode}`);
  const observation: Observation = {
    ...plan, fixtureCommit, provider: "openai-codex", model: "gpt-5.6-luna", piVersion, packageVersion,
    startedAt: started.toISOString(), wallTimeMs: Date.now() - started.getTime(), eventStream, terminalEnvelope: (envelope ?? {}) as Json,
    usage: usage(eventStream), deterministicPassed: errors.length === 0, deterministicErrors: errors, capturedFiles, stderr,
  };
  await mkdir(dirname(observationPath), { recursive: true });
  await writeFile(observationPath, JSON.stringify(observation, null, 2) + "\n", { flag: "wx" });
  await workspace.cleanup();
  await rm(sessionDir, { recursive: true, force: true });
  await rm(childEventsPath, { force: true });
  return observation;
}

async function loadObservations(directory: string): Promise<Observation[]> {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(files.map(async (name) => parseJson<Observation>(await readFile(resolve(directory, name), "utf8"))));
}
export function finalizeRecords(plan: TrialPlan[], observations: Observation[], scorecard: Scorecard, oracles: OracleManifest): TrialRecord[] {
  if (!scorecard.reviewer.trim() || Number.isNaN(Date.parse(scorecard.reviewedAt))) throw new Error("missing human reviewer evidence");
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  return plan.map((trial) => {
    const observation = byId.get(trial.id);
    if (!observation) throw new Error(`missing observation ${trial.id}`);
    const scored = scorecard.trials[trial.id];
    if (!scored) throw new Error(`missing human score ${trial.id}`);
    const expected = [...oracleChecks(oracles, trial.scenario)].sort();
    if (JSON.stringify(Object.keys(scored.checks).sort()) !== JSON.stringify(expected) || Object.values(scored.checks).some((value) => typeof value !== "boolean")) throw new Error(`incomplete human score ${trial.id}`);
    const humanOracle = scored.checks as Record<string, boolean>;
    return { ...observation, humanOracle, humanReview: { reviewer: scorecard.reviewer, reviewedAt: scorecard.reviewedAt }, humanPassed: Object.values(humanOracle).every(Boolean) };
  });
}

async function main() {
  const manifest = parseJson<Parameters<typeof buildPlan>[0]>(await readFile(MANIFEST_PATH, "utf8"));
  const oracles = parseJson<OracleManifest>(await readFile(ORACLES_PATH, "utf8"));
  const plan = buildPlan(manifest);
  const mode = process.argv[2];
  if (mode === "run") {
    const output = resolve(process.argv[3] ?? "artifacts/behavioral/provider-run");
    const selectedId = process.argv.find((arg) => arg.startsWith("--trial="))?.slice(8);
    const selectedThinking = process.argv.find((arg) => arg.startsWith("--thinking="))?.slice(11) as Thinking | undefined;
    const selected = plan.filter((trial) => (!selectedId || trial.id === selectedId) && (!selectedThinking || trial.thinking === selectedThinking));
    if (!selected.length) throw new Error("no trials matched selection");
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
    if (dirty) throw new Error("provider trials require a clean committed fixture checkout");
    const fixtureCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const piVersion = execFileSync("pi", ["--version"], { encoding: "utf8" }).trim();
    const packageVersion = parseJson<{ version: string }>(await readFile(resolve(ROOT, "package.json"), "utf8")).version;
    for (const trial of selected) {
      const result = await runTrial(trial, output, fixtureCommit, piVersion, packageVersion);
      console.log(`${result.deterministicPassed ? "PASS" : "FAIL"} ${trial.id}${result.deterministicErrors.length ? `: ${result.deterministicErrors.join("; ")}` : ""}`);
    }
    return;
  }
  if (mode === "review") {
    const observationsDir = resolve(process.argv[3] ?? "");
    const output = resolve(process.argv[4] ?? "artifacts/behavioral/scorecard.json");
    const observations = await loadObservations(observationsDir);
    const scorecard: Scorecard = { reviewer: "", reviewedAt: "", trials: {} };
    for (const observation of observations) scorecard.trials[observation.id] = { checks: Object.fromEntries(oracleChecks(oracles, observation.scenario).map((check) => [check, null])) };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(scorecard, null, 2) + "\n", { flag: "wx" });
    const packet = observations.map((observation) => {
      const evidence = assistantText(observation.eventStream);
      const files = Object.entries(observation.capturedFiles).map(([path, content]) => `\n### Captured ${path}\n\n${content}`).join("\n");
      const checks = oracleChecks(oracles, observation.scenario).map((check) => `- [ ] ${check}`).join("\n");
      return `## ${observation.id}\n\nDeterministic: ${observation.deterministicPassed ? "PASS" : `FAIL — ${observation.deterministicErrors.join("; ")}`}\n\n### Terminal answer\n\n${evidence}${files}\n\n### Human checks\n\n${checks}`;
    }).join("\n\n---\n\n");
    const packetPath = `${output}.review.md`;
    await writeFile(packetPath, `# Behavioral battery human review packet\n\nDo not expose this oracle inventory to Subagents. Review every answer against repository evidence, then enter explicit booleans plus reviewer identity and review time in \`${basename(output)}\`.\n\n${packet}\n`, { flag: "wx" });
    console.log(`Review ${observations.length} immutable observations in ${packetPath}, then record explicit binary outcomes in ${output}`);
    return;
  }
  if (mode === "finalize") {
    const observationsDir = resolve(process.argv[3] ?? ""), scorecardPath = resolve(process.argv[4] ?? ""), output = resolve(process.argv[5] ?? "records.json");
    const records = finalizeRecords(plan, await loadObservations(observationsDir), parseJson<Scorecard>(await readFile(scorecardPath, "utf8")), oracles);
    const errors = validateRecords(plan, records);
    await writeFile(output, JSON.stringify(records, null, 2) + "\n", { flag: "wx" });
    if (errors.length) throw new Error(`records preserved with failures:\n${errors.join("\n")}`);
    console.log(`PASS: ${records.length} trials, ${records.reduce((sum, record) => sum + record.children, 0)} child sessions`);
    return;
  }
  throw new Error("usage: behavioral-runner run <directory> [--trial=id|--thinking=level] | review <observations-directory> <scorecard.json> | finalize <observations-directory> <scorecard.json> <records.json>");
}
if (import.meta.main) await main();
