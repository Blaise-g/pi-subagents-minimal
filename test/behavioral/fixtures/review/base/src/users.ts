export type UserSummary = { displayName: string; theme: "light" | "dark" };

export function emptySummary(): UserSummary {
  return { displayName: "", theme: "light" };
}
