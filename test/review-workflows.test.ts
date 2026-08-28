import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workflows = [
  { file: "test/fixtures/parent-skills/code-review-diff.v0.2.0.md", lenses: ["Standards", "Spec"], comparison: "since" },
  { file: "test/fixtures/parent-skills/code-simplify.v0.2.0.md", lenses: ["Reuse", "Quality", "Efficiency"], comparison: "working_tree" },
] as const;

function taskExamples(source: string): Array<Record<string, unknown>> {
  return [...source.matchAll(/```json task\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]!));
}

test("versioned parent review skills use independent strict 0.2.0 Tasks", async () => {
  for (const workflow of workflows) {
    const source = await readFile(workflow.file, "utf8");
    expect(source).toContain("workflow-version: 0.2.0");
    const tasks = taskExamples(source);
    expect(tasks).toHaveLength(workflow.lenses.length);
    expect(tasks.map(({ task }) => workflow.lenses.find((lens) => String(task).includes(`Lens: ${lens}`)))).toEqual([...workflow.lenses]);
    for (const task of tasks) {
      expect(Object.keys(task).sort()).toEqual(["task", "tools"]);
      expect(task.tools).toEqual(["git_diff"]);
      expect(String(task.task)).toContain(`comparison: \"${workflow.comparison}\"`);
      expect(String(task.task)).toContain("Do not edit files or run tests/checks");
      expect(String(task.task)).toContain("Return concise findings");
    }
    expect(source).toContain("The Orchestrator, not review Subagents, runs any tests or checks");
    expect(source).not.toMatch(/shell sandbox|Agent tool|"agent"\s*:|"systemPrompt"\s*:|Bash|PowerShell|\bweb\b/i);
  }
});

test("fixed-point and working-tree workflow descriptions match git_diff semantics", async () => {
  const diff = await readFile(workflows[0].file, "utf8");
  expect(diff).toContain("merge base of the fixed point and HEAD through the current working tree");
  expect(diff).toContain("fixed point through HEAD commit summary");
  const simplify = await readFile(workflows[1].file, "utf8");
  expect(simplify).toContain("HEAD through the current working tree");
  expect(simplify).toContain("staged, unstaged, and non-ignored untracked evidence");
});
