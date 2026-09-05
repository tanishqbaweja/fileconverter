import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = JSON.parse(
  await readFile(
    path.join(projectRoot, "evidence", "heif-heic-feasibility-2026-09-05.json"),
    "utf8",
  ),
);

test("N-03 records the pinned HEIF/HEIC feasibility decision", () => {
  assert.equal(evidence.requirement, "N-03");
  assert.equal(evidence.status, "intentionally-unsupported");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.publicProfiles, 0);
  assert.equal(evidence.candidateAudit.containerLibrary.tag, "v1.23.3");
  assert.equal(
    evidence.candidateAudit.containerLibrary.commit,
    "78c9746aea226b22885e8d35241353ce669c4ea5",
  );
  assert.equal(evidence.licensingAssessment.notLegalAdvice, true);
  assert.equal(evidence.revisitConditions.length, 5);
});

test("production Chrome proves no native image route while exposing a conditional HEVC codec", () => {
  const probe = evidence.productionBrowserProbe;
  assert.equal(probe.browser, "Google Chrome");
  assert.match(probe.version, /^152\./);
  assert.equal(probe.secureContext, true);
  assert.equal(probe.crossOriginIsolated, true);
  assert.equal(probe.imageDecoder["image/avif"], true);
  for (const mime of [
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
  ]) {
    assert.equal(probe.imageDecoder[mime], false, mime);
  }
  assert.equal(probe.videoDecoder["hvc1.1.6.L93.B0"], true);
  assert.equal(probe.videoDecoder["hev1.1.6.L93.B0"], true);
  assert.equal(probe.focusedRegression.result, "1 passed");
  assert.equal(probe.fullPrivacyOfflineRegression.result, "15 passed");
});

test("HEIF and HEIC stay absent from every public and private conversion profile", () => {
  const leaked = conversionProfiles.filter(
    (profile) =>
      ["heif", "heic"].includes(profile.input) ||
      ["heif", "heic"].includes(profile.output),
  );
  assert.deepEqual(leaked, []);
});

test("runtime probes and the production browser gate retain every audited MIME", async () => {
  const capabilitySource = await readFile(
    path.join(projectRoot, "lib", "browser-capabilities.ts"),
    "utf8",
  );
  const browserSource = await readFile(
    path.join(projectRoot, "tests", "browser", "privacy-offline.spec.ts"),
    "utf8",
  );
  for (const mime of Object.keys(evidence.productionBrowserProbe.imageDecoder)) {
    assert.ok(capabilitySource.includes(`"${mime}"`), mime);
  }
  for (const mime of [
    "image/heic",
    "image/heic-sequence",
    "image/heif",
    "image/heif-sequence",
  ]) {
    assert.ok(
      browserSource.includes(`imageDecoderTypes["${mime}"]).toBe(false)`),
      mime,
    );
  }
});

test("the unsupported decision is documented and tied to primary sources", async () => {
  assert.ok(evidence.sources.length >= 10);
  assert.ok(
    evidence.sources.every((source) =>
      source.url.startsWith("https://"),
    ),
  );
  for (const relativePath of [
    "README.md",
    "TESTED.md",
    "REMAINING_WORK.md",
    "scripts/generate-tested-ledger.mjs",
  ]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(source.includes("heif-heic-feasibility-2026-09-05.json"), relativePath);
  }
});
