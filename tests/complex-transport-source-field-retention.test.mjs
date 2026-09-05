import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceName =
  "complex-transport-source-field-retention-browser-2026-09-06.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

const expectedProfileIds = [
  "mpeg-ts-to-mkv",
  "mpeg-ts-to-3gp",
  "mpeg-ts-to-mov",
  "mpeg-ts-to-flv",
  "flv-to-mkv",
  "flv-to-mpeg-ts",
  "flv-to-3gp",
  "flv-to-mov",
];

test("M-03 complex MPEG-TS/FLV evidence covers eight public stream copies", () => {
  assert.equal(evidence.requirement, "M-03");
  assert.equal(evidence.status, "partial-checkpoint");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.execution.result, "8 passed");
  assert.equal(evidence.execution.affectedAacRegressionResult, "46 passed");
  assert.equal(evidence.routeMatrix.totalRoutes, expectedProfileIds.length);
  assert.deepEqual(evidence.routeMatrix.profileIds, expectedProfileIds);
  assert.equal(new Set(evidence.routeMatrix.profileIds).size, expectedProfileIds.length);
  for (const id of expectedProfileIds) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, id);
    assert.equal(profile.public, true, id);
    assert.equal(profile.automatedTestStatus, "passed", id);
    assert.equal(profile.route, "stream-copy", id);
  }
});

test("the generated complex transport fixture identities are pinned", () => {
  assert.equal(evidence.sourceInputs.mpegTs.bytes, 818364);
  assert.equal(
    evidence.sourceInputs.mpegTs.sha256,
    "ce8da311a71a3919ad46d1933cac4554027547639b234ec6bcee01d0849ce73c",
  );
  assert.equal(evidence.sourceInputs.flv.bytes, 732932);
  assert.equal(
    evidence.sourceInputs.flv.sha256,
    "1e70ed53d9c5e5d8f79dcf97e5a166169ae43a10981e0f336f2b9bf935725262",
  );
  assert.equal(evidence.sourceInputs.mpegTs.byteRepeatableAcrossTwoGenerations, true);
  assert.equal(evidence.sourceInputs.flv.byteRepeatableAcrossTwoGenerations, true);
});

test("browser source locks non-empty AAC normalization and transport semantics", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const id of expectedProfileIds) assert.ok(source.includes(`"${id}"`), id);
  for (const fixture of [
    "complex-remux-source.mpegts",
    "complex-remux-source.flv",
  ]) {
    assert.ok(source.includes(fixture), fixture);
  }
  for (const assertion of [
    "expectVideoPacketMatch",
    "expectDecodedVideoMatch",
    "expectAacAccessUnitMatch",
    "expectRotationExcluded",
    "mediaTag",
  ]) {
    assert.ok(source.includes(assertion), assertion);
  }
  assert.ok(source.includes("const usesAdtsPackets ="));
  assert.ok(source.includes('usesAdtsPackets ? ["-bsf:a", "aac_adtstoasc"] : []'));
  assert.ok(source.includes('route.destination === "3gp"'));
  assert.ok(source.includes('["und"]'));
  assert.ok(source.includes("Object.values(complexTransportSourceFixturePaths)"));
  assert.ok(source.includes("Object.values(complexTransportSourceOutputPaths)"));
});

test("the checkpoint remains visible and honestly partial in every ledger", async () => {
  for (const relativePath of [
    "README.md",
    "TESTED.md",
    "REMAINING_WORK.md",
    "scripts/generate-tested-ledger.mjs",
  ]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(source.includes(evidenceName), relativePath);
  }
  assert.match(evidence.scope, /M-03 remains partial/);
  assert.match(evidence.scope, /AVI, WebM, and Ogg/);
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
  assert.equal(evidence.cleanup.generatedSourceFixturesRetained, 0);
  assert.equal(evidence.cleanup.diagnosticCopiesRetained, 0);
});
