import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildReleaseRecord,
  validateEvidenceInventory,
  validateReleaseIdentity,
  type EvidenceInventory,
} from "../tools/release.js";

const root = resolve(".");

describe("release qualification", () => {
  test("the assertion inventory covers every contract section and change-to-evidence assertion", async () => {
    const contract = await readFile(resolve(root, "docs/spec/v1-implementation-contract.md"), "utf8");
    const inventory = JSON.parse(await readFile(resolve(root, "docs/release-evidence.json"), "utf8")) as EvidenceInventory;
    expect(await validateEvidenceInventory(root, contract, inventory)).toEqual([]);
  });

  test("rejects an untagged, mismatched, or dirty publication candidate", () => {
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.0", dirty: false })).toEqual([]);
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "branch", refName: "main", dirty: false })).toContain("release ref must be a tag");
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.1", dirty: false })).toContain("tag v1.0.1 does not match package version 1.0.0");
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.0", dirty: true })).toContain("release checkout is dirty");
  });

  test("release records retain exact versions, digest, commit, and Behavioral-battery evidence", () => {
    const record = buildReleaseRecord({
      packageVersion: "1.0.0",
      commit: "a".repeat(40),
      tag: "v1.0.0",
      tarballSha256: "b".repeat(64),
      behavioralBattery: { records: "records.json", sha256: "c".repeat(64), trials: 36, children: 63 },
      qualifications: [
        { platform: "linux", piVersion: "0.84.3", nodeVersion: "22.19.0", bunVersion: "1.4.0" },
        { platform: "darwin", piVersion: "0.84.9", nodeVersion: "24.7.0", bunVersion: "1.4.0" },
      ],
      workflow: { repository: "Blaise-g/pi-subagents-minimal", runId: "42", runAttempt: "1" },
    });
    expect(record.schemaVersion).toBe(1);
    expect(record.package).toEqual({ name: "pi-subagents-minimal", version: "1.0.0" });
    expect(record.qualifications.map(({ piVersion, nodeVersion, bunVersion }) => [piVersion, nodeVersion, bunVersion])).toEqual([
      ["0.84.9", "24.7.0", "1.4.0"],
      ["0.84.3", "22.19.0", "1.4.0"],
    ]);
    expect(record.tarball.sha256).toBe("b".repeat(64));
    expect(record.behavioralBattery.trials).toBe(36);
  });

  test("the publish workflow makes provenance publication depend on every release gate", async () => {
    const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("issues: read");
    expect(workflow).toContain("bun tools/behavioral-battery.ts verify");
    expect(workflow).toContain("bun tools/release.ts verify-inventory");
    expect(workflow).toContain("bun tools/release.ts verify-identity");
    expect(workflow).toContain("npm publish --provenance --access public");
    expect(workflow).toContain("install -l npm:pi-subagents-minimal@");
    expect(workflow).toContain("environment: npm");

    const publish = workflow.indexOf("npm publish --provenance --access public");
    expect(publish).toBeGreaterThan(workflow.indexOf("Fresh exact-version candidate install"));
    expect(publish).toBeGreaterThan(workflow.indexOf("Create release record"));
    expect(publish).toBeGreaterThan(workflow.indexOf("Verify release blockers are closed"));
  });
});
