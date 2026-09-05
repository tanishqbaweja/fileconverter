import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceName = "complex-iso-source-field-retention-browser-2026-09-05.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

const expectedProfileIds = [
  "mov-to-mkv",
  "mov-to-mpeg-ts",
  "mov-to-3gp",
  "mov-to-flv",
  "3gp-to-mkv",
  "3gp-to-mpeg-ts",
  "3gp-to-mov",
  "3gp-to-flv",
];

test("M-03 complex MOV/3GP evidence covers eight public stream-copy routes", () => {
  assert.equal(evidence.requirement, "M-03");
  assert.equal(evidence.status, "partial-checkpoint");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.execution.result, "8 passed");
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

test("the generated complex ISO-BMFF fixture identities are pinned", () => {
  assert.equal(evidence.sourceInputs.mov.bytes, 782828);
  assert.equal(
    evidence.sourceInputs.mov.sha256,
    "6b261f3aabecaf42fbf351fe0f81e39c03032025868749fc172f1f9a25285a37",
  );
  assert.equal(evidence.sourceInputs.threeGp.bytes, 782251);
  assert.equal(
    evidence.sourceInputs.threeGp.sha256,
    "203417b19f7c1507008064fdf5c2dc2e7bb2d2983c1b7f81e4bc15a00efe1816",
  );
  assert.deepEqual(evidence.sourceInputs.mov.streamCodecsInOrder, [
    "h264",
    "aac",
    "aac",
  ]);
  assert.deepEqual(evidence.sourceInputs.threeGp.streamCodecsInOrder, [
    "h264",
    "aac",
    "aac",
  ]);
});

test("browser source retains every route, payload validator, and cleanup fixture", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const id of expectedProfileIds) assert.ok(source.includes(`"${id}"`), id);
  for (const fixture of ["complex-remux-source.mov", "complex-remux-source.3gp"]) {
    assert.ok(source.includes(fixture), fixture);
  }
  for (const assertion of [
    "expectVideoPacketMatch",
    "expectDecodedVideoMatch",
    "expectAacAccessUnitMatch",
    "expectRotationExcluded",
  ]) {
    assert.ok(source.includes(assertion), assertion);
  }
  assert.ok(source.includes("Object.values(complexIsoSourceFixturePaths)"));
  assert.ok(source.includes("Object.values(complexIsoSourceOutputPaths)"));
});

test("the checkpoint remains visible in every maintained project ledger", async () => {
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
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
  assert.equal(evidence.cleanup.generatedSourceFixturesRetained, 0);
  assert.equal(evidence.cleanup.browserTestArtifactsRetained, 0);
});
