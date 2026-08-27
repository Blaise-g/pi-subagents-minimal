import { resolve, sep } from "node:path";

export function safeJoin(root: string, leaf: string): string {
  const path = resolve(root, leaf);
  if (!path.startsWith(resolve(root) + sep)) throw new Error("UnsafePath");
  return path;
}
