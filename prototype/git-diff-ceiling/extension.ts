// PROTOTYPE ONLY: compares model-visible git_diff ceilings; not production behavior.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGitBoundary } from "../../src/git-boundary.ts";
import { createGitDiffTool } from "../../src/git-diff.ts";

const validPrefix = (value: string, limit: number) => {
  const data = Buffer.from(value, "utf8");
  if (data.length <= limit) return value;
  let end = limit;
  while (end && (data[end]! & 0xc0) === 0x80) end--;
  return data.subarray(0, end).toString("utf8");
};

export default function (pi: ExtensionAPI) {
  const ceiling = Number(process.env.PROTOTYPE_GIT_DIFF_CEILING_KIB ?? "80") * 1024;
  pi.on("session_start", async (_event, ctx) => {
    const base = createGitDiffTool(await createGitBoundary(ctx.cwd, { maxOutputBytes: 8 * 1024 * 1024 }));
    pi.registerTool({
      ...base,
      async execute(id, input, signal, update, toolCtx) {
        const result = await base.execute(id, input, signal, update, toolCtx);
        const text = result.content[0]?.type === "text" ? result.content[0].text : "";
        if (Buffer.byteLength(text, "utf8") <= ceiling) return result;
        const notice = `\n\n[PROTOTYPE: git_diff output truncated at ${ceiling / 1024} KiB; request literal paths for further evidence.]`;
        return { ...result, content: [{ type: "text" as const, text: validPrefix(text, ceiling - Buffer.byteLength(notice)) + notice }], details: { ...result.details, prototypeCeilingKiB: ceiling / 1024 } };
      },
    });
    pi.setActiveTools(["read", "grep", "find", "ls", "git_diff"]);
  });
}
