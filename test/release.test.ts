import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildReleaseRecord,
  validateEvidenceInventory,
  validateReleaseIdentity,
  smoke,
  type EvidenceInventory,
} from "../tools/release.js";

const root = resolve(".");

describe("release qualification", () => {
  test("the assertion inventory covers every contract section and change-to-evidence assertion", async () => {
    const contract = await readFile(resolve(root, "docs/spec/v1-implementation-contract.md"), "utf8");
    const inventory = JSON.parse(await readFile(resolve(root, "docs/release-evidence.json"), "utf8")) as EvidenceInventory;
    expect(await validateEvidenceInventory(root, contract, inventory)).toEqual([]);
  });

  test("the release contract contains only mechanical evidence and no retired battery assets", async () => {
    const inventory = JSON.parse(await readFile(resolve(root, "docs/release-evidence.json"), "utf8")) as EvidenceInventory;
    expect(new Set(Object.values(inventory.evidenceCatalog).map(({ kind }) => kind))).not.toContain("behavioral");

    const retired = [
      ".github/workflows/behavioral-battery.yml",
      "docs/behavioral-battery.md",
      "tools/behavioral-battery.ts",
      "tools/behavioral-runner.ts",
      "tools/behavioral-observer-extension.ts",
      "tools/prepare-battery-fixture.sh",
      "test/behavioral-battery.test.ts",
      "test/behavioral-runner.test.ts",
      "test/behavioral",
    ];
    for (const path of retired) await expect(access(resolve(root, path))).rejects.toThrow();
  });

  test("rejects an untagged, mismatched, or dirty publication candidate", () => {
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.0", dirty: false })).toEqual([]);
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "branch", refName: "main", dirty: false })).toContain("release ref must be a tag");
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.1", dirty: false })).toContain("tag v1.0.1 does not match package version 1.0.0");
    expect(validateReleaseIdentity({ version: "1.0.0", refType: "tag", refName: "v1.0.0", dirty: true })).toContain("release checkout is dirty");
  });

  test("release records retain only package, source, artifact, qualification, and workflow identity", () => {
    const record = buildReleaseRecord({
      packageVersion: "1.0.0",
      commit: "a".repeat(40),
      tag: "v1.0.0",
      tarballSha256: "b".repeat(64),
      qualifications: [
        { platform: "linux", piVersion: "0.84.3", nodeVersion: "22.19.0", bunVersion: "1.4.0" },
        { platform: "darwin", piVersion: "0.84.9", nodeVersion: "24.7.0", bunVersion: "1.4.1" },
        { platform: "darwin", piVersion: "0.84.9", nodeVersion: "24.7.0", bunVersion: "1.4.0" },
      ],
      workflow: { repository: "Blaise-g/pi-subagents-minimal", runId: "42", runAttempt: "1" },
    });
    expect(record.schemaVersion).toBe(1);
    expect(record.package).toEqual({ name: "pi-subagents-minimal", version: "1.0.0" });
    expect(record.qualifications.map(({ piVersion, nodeVersion, bunVersion }) => [piVersion, nodeVersion, bunVersion])).toEqual([
      ["0.84.9", "24.7.0", "1.4.0"],
      ["0.84.9", "24.7.0", "1.4.1"],
      ["0.84.3", "22.19.0", "1.4.0"],
    ]);
    expect(record.tarball.sha256).toBe("b".repeat(64));
    expect(record.source).toEqual({ commit: "a".repeat(40), tag: "v1.0.0" });
    expect(record.workflow).toEqual({ repository: "Blaise-g/pi-subagents-minimal", runId: "42", runAttempt: "1" });
    expect(Object.keys(record).sort()).toEqual(["package", "qualifications", "schemaVersion", "source", "tarball", "workflow"]);
  });

  test("the public package loader smoke accepts exactly the two package tools", async () => {
    await expect(smoke(resolve(root, "src/index.ts"))).resolves.toBeUndefined();
  });

  test("records the 0.2.0 dogfood qualification without a publication or model-quality claim", async () => {
    const record = JSON.parse(await readFile(resolve(root, "docs/dogfood-qualification.json"), "utf8"));
    expect(record).toMatchObject({
      schemaVersion: 1,
      packageVersion: "0.2.0",
      changeClassification: "significant",
      modelEvaluation: { collected: false, kind: "none" },
    });
    expect(record.externalWorkflows).toEqual([
      { name: "code-review-diff", version: "0.2.0", evidence: "test/review-workflows.test.ts" },
      { name: "code-simplify", version: "0.2.0", evidence: "test/review-workflows.test.ts" },
    ]);
    expect(record.claims).toContain("deterministic-dogfood-candidate");
    expect(record.claims).not.toContain("stable-publication");
    expect(record.claims).not.toContain("general-model-quality");
  });

  test("the publish workflow makes provenance publication depend on every release gate", async () => {
    const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("id-token: write");
    expect(workflow).not.toContain("behavioral_records");
    expect(workflow).not.toContain("issues: read");
    expect(workflow).not.toContain("gh api");
    expect(workflow).not.toContain("tools/behavioral-battery.ts verify");
    expect(workflow).not.toContain("battery:");
    expect(workflow).not.toContain("provider-backed");
    expect(workflow).toContain("bun tools/release.ts verify-inventory");
    expect(workflow).toContain("bun tools/release.ts verify-identity");
    expect(workflow).toContain("npm publish --provenance --access public");
    expect(workflow).toContain("install -l npm:pi-subagents-minimal@");
    expect(workflow).toContain("environment: npm");
    expect(workflow).toContain("actions/checkout@v5");
    expect(workflow).toContain("actions/setup-node@v5");
    expect(workflow).toContain("actions/upload-artifact@v6");
    expect(workflow).toContain("actions/download-artifact@v7");
    expect(workflow).not.toMatch(/actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v4/);

    const qualification = await readFile(resolve(root, ".github/workflows/qualification.yml"), "utf8");
    expect(qualification).toContain('PACKAGE_VERSION=$(node -p "require(\'./package.json\').version")');
    expect(qualification).not.toContain("p.version!=='1.0.0'");
    expect(qualification).toContain("bun test test/git-boundary.test.ts test/git-diff.test.ts");
    expect(qualification).toContain("Fresh local candidate pi install");
    expect(qualification).toContain('pi" install -l "$PACKAGE_ROOT"');
    expect(qualification).toContain("actions/checkout@v5");
    expect(qualification).toContain("actions/setup-node@v5");
    expect(qualification).not.toMatch(/actions\/(?:checkout|setup-node)@v4/);

    const publish = workflow.indexOf("npm publish --provenance --access public");
    expect(publish).toBeGreaterThan(workflow.indexOf("Fresh exact-version candidate install"));
    expect(publish).toBeGreaterThan(workflow.indexOf("Create release record"));
  });
});
