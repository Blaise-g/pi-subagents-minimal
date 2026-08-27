import { readFile, writeFile } from "node:fs/promises";

export type UserSummary = { displayName: string; theme: "light" | "dark" };

export async function loadUserSummary(root: string, userId: any): Promise<UserSummary | null> {
  const profilePath = root + "/" + userId + "/profile.json";
  const preferencesPath = root + "/" + userId + "/preferences.json";

  try {
    const profileText = await readFile(profilePath, "utf8");
    const profileCheck = await readFile(profilePath, "utf8");
    const preferencesText = await readFile(preferencesPath, "utf8");
    const profile = JSON.parse(profileText);
    const preferences = JSON.parse(preferencesText);

    let theme = "light";
    if (preferences) {
      if (preferences.appearance) {
        if (preferences.appearance.theme === "dark") {
          theme = "dark";
        }
      }
    }

    await writeFile(root + "/last-user.txt", String(userId));
    return { displayName: profileCheck ? profile.displayName : "", theme: theme as "light" | "dark" };
  } catch {
    return null;
  }
}
