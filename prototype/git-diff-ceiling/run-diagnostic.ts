// PROTOTYPE ONLY. Runs provider-backed matched reviews and writes raw JSON evidence.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dir, "../..");
const out = join(import.meta.dir, "diagnostic-results");
const run = (cmd: string, args: string[], cwd: string, env = process.env) => new Promise<{stdout:string;stderr:string;ms:number}>((ok, fail) => {
  const started = performance.now(); const p = spawn(cmd, args, { cwd, env, stdio:["ignore","pipe","pipe"] }); let stdout="",stderr="";
  p.stdout.on("data", d => stdout += d); p.stderr.on("data", d => stderr += d);
  p.on("close", code => code === 0 ? ok({stdout,stderr,ms:Math.round(performance.now()-started)}) : fail(new Error(`${cmd} ${code}: ${stderr}`)));
});
async function fixture(kind: "broad"|"threshold") {
  const dir = await mkdtemp(join(tmpdir(), `git-diff-${kind}-`));
  await run("git", ["init","-q"], dir); await run("git", ["config","user.name","Prototype"], dir); await run("git", ["config","user.email","prototype@example.invalid"], dir);
  await writeFile(join(dir,"AGENTS.md"), "All exported functions require input validation. Never swallow errors. Changes must satisfy SPEC.md.\n");
  await writeFile(join(dir,"SPEC.md"), "Implement bounded record parsing. Reject malformed records, preserve source identifiers, and return actionable errors. Do not add caching or network access.\n");
  const count = kind === "broad" ? 12 : 3; const lines = kind === "broad" ? 430 : 620;
  await mkdir(join(dir,"src"));
  for (let f=0; f<count; f++) await writeFile(join(dir,"src",`part-${f}.ts`), `export function parse${f}(input: string) {\n  return { id: input, value: input };\n}\n`);
  await run("git",["add","."],dir); await run("git",["commit","-qm","baseline"],dir);
  for (let f=0; f<count; f++) {
    const body = Array.from({length:lines},(_,i)=>`  const record${i} = input.split(\":\")[${i%3}] ?? \"\";`).join("\n");
    const defect = f === count-1 ? "\n  try { JSON.parse(input); } catch {}\n" : "";
    await writeFile(join(dir,"src",`part-${f}.ts`), `export function parse${f}(input: string) {\n${body}${defect}  return { id: input, value: record0 };\n}\n`);
  }
  return dir;
}
const prompts = {
  standards: "Lens: Standards. Review the working-tree changes for violations of AGENTS.md and material code smells. Use git_diff, make literal-path follow-up calls as needed, and cite exact evidence. Return concise findings or state none. Do not edit or run commands.",
  spec: "Lens: Spec. Review the working-tree changes against SPEC.md. Use git_diff, make literal-path follow-up calls as needed, and cite each missing, incorrect, or unrequested behavior with exact evidence. Return concise findings or state none. Do not edit or run commands.",
};
await mkdir(out,{recursive:true});
const cases = [{ kind: "broad" as const, lens: "standards" as const }, { kind: "threshold" as const, lens: "spec" as const }];
for (const {kind,lens} of cases) {
  const cwd = await fixture(kind);
  for (const repetition of [1,2,3,4]) {
    const order = repetition % 2 ? [50,80] : [80,50];
    for (const ceiling of order) {
      const name=`${kind}-${lens}-r${repetition}-${ceiling}`; console.error(`running ${name}`);
      const result=await run("pi",["--mode","json","--print","--no-extensions","--no-skills","--no-prompt-templates","--no-context-files","--extension",join(root,"prototype/git-diff-ceiling/extension.ts"),"--model","openai-codex/gpt-5.6-luna","--thinking","high",prompts[lens]],cwd,{...process.env,PROTOTYPE_GIT_DIFF_CEILING_KIB:String(ceiling)});
      const events=result.stdout.trim().split("\n").map(JSON.parse);
      const messages=events.filter((e:any)=>e.type==="message_end").map((e:any)=>e.message);
      const assistants=messages.filter((m:any)=>m.role==="assistant");
      const turns=assistants.map((m:any,index:number)=>{const calls=(m.content??[]).filter((c:any)=>c.type==="toolCall");return {index:index+1,calls:calls.map((c:any)=>({name:c.name,path:c.arguments?.path})),usage:m.usage};});
      const final=[...assistants].reverse().find((m:any)=>(m.content??[]).some((c:any)=>c.type==="text"));
      const answer=(final?.content??[]).filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n");
      await writeFile(join(out,`${name}.json`),JSON.stringify({name,kind,lens,repetition,order,ceiling,latencyMs:result.ms,turns,answer},null,2));
    }
  }
}
