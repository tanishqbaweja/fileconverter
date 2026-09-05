import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidence = JSON.parse(
  await readFile(
    path.join(projectRoot, "evidence", "camera-raw-feasibility-2026-09-05.json"),
    "utf8",
  ),
);

const rawMimes = [
  "image/x-adobe-dng",
  "image/x-canon-cr2",
  "image/x-nikon-nef",
  "image/x-sony-arw",
];

const rawFormats = [
  "dng",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "raf",
  "orf",
  "rw2",
  "raw",
];

test("N-04 records a pinned, measured camera-RAW decision", () => {
  assert.equal(evidence.requirement, "N-04");
  assert.equal(evidence.status, "intentionally-unsupported");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.publicProfiles, 0);
  assert.equal(evidence.shippingAssessment.notImpossible, true);
  assert.equal(evidence.candidateAudit.libraw.tag, "0.22.2");
  assert.equal(
    evidence.candidateAudit.libraw.commit,
    "b93f6e45c194f5df9b02a43b1af9a54b4f41f33f",
  );
  assert.equal(evidence.candidateAudit.librawWasm.tag, "v1.6.0");
  assert.equal(evidence.candidateAudit.rawSpeed.commit.length, 40);
  assert.equal(evidence.revisitConditions.length, 6);
});

test("production Chrome proves no native RAW ImageDecoder route", () => {
  const probe = evidence.productionBrowserProbe;
  assert.equal(probe.browser, "Google Chrome");
  assert.match(probe.version, /^152\./);
  assert.equal(probe.secureContext, true);
  assert.equal(probe.crossOriginIsolated, true);
  assert.equal(probe.imageDecoder["image/avif"], true);
  assert.equal(probe.imageDecoder["image/png"], true);
  for (const mime of rawMimes) {
    assert.equal(probe.imageDecoder[mime], false, mime);
  }
  assert.equal(probe.focusedRegression.result, "1 passed");
  assert.equal(probe.fullPrivacyOfflineRegression.result, "15 passed");
});

test("camera-RAW formats stay absent from every conversion profile", () => {
  const leaked = conversionProfiles.filter(
    (profile) =>
      rawFormats.includes(profile.input) || rawFormats.includes(profile.output),
  );
  assert.deepEqual(leaked, []);
});

test("runtime probes and browser regression retain each audited RAW MIME", async () => {
  const capabilitySource = await readFile(
    path.join(projectRoot, "lib", "browser-capabilities.ts"),
    "utf8",
  );
  const browserSource = await readFile(
    path.join(projectRoot, "tests", "browser", "privacy-offline.spec.ts"),
    "utf8",
  );
  for (const mime of rawMimes) {
    assert.ok(capabilitySource.includes(`"${mime}"`), mime);
    assert.ok(
      browserSource.includes(`imageDecoderTypes["${mime}"]).toBe(false)`),
      mime,
    );
  }
});

test("the RAW decision stays documented and source-backed", async () => {
  assert.ok(evidence.sources.length >= 10);
  assert.ok(evidence.sources.every((source) => source.url.startsWith("https://")));
  assert.equal(evidence.cleanup.convertedOutputsCreated, 0);
  assert.equal(evidence.cleanup.temporaryUpstreamClonesRemovedAfterAudit, true);
  assert.equal(evidence.cleanup.protectedFixtureTouched, false);
  for (const relativePath of [
    "README.md",
    "TESTED.md",
    "REMAINING_WORK.md",
    "scripts/generate-tested-ledger.mjs",
  ]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(
      source.includes("camera-raw-feasibility-2026-09-05.json"),
      relativePath,
    );
  }
});
