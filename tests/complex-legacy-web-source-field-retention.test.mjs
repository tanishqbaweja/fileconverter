import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceName =
  "complex-legacy-web-source-field-retention-browser-2026-09-06.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

const expectedProfileIds = ["avi-to-mkv", "webm-to-mkv", "ogv-to-mkv"];

test("M-03 complex AVI/WebM/Ogg evidence covers three public stream copies", () => {
  assert.equal(evidence.requirement, "M-03");
  assert.equal(evidence.status, "partial-checkpoint");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.execution.result, "3 passed");
  assert.equal(evidence.execution.affectedMatroskaRegressionResult, "11 passed");
  assert.equal(evidence.routeMatrix.totalRoutes, expectedProfileIds.length);
  assert.deepEqual(evidence.routeMatrix.profileIds, expectedProfileIds);
  assert.equal(evidence.routeMatrix.allGeneratedSourcesUseTheirGenuineContainer, true);
  for (const id of expectedProfileIds) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, id);
    assert.equal(profile.public, true, id);
    assert.equal(profile.automatedTestStatus, "passed", id);
    assert.equal(profile.route, "stream-copy", id);
  }
});

test("the bit-exact complex source identities are pinned", () => {
  const expected = {
    avi: [1411626, "747842faadb824636ae4a7af7b9a68b14ed05dff69956e888065d870a7569d36"],
    webm: [1747654, "04f04ce906a8fdd020b24c860a7fb96a86de1fcdee6bab63bff2ab8e8845552c"],
    ogg: [726777, "fe09e5d71bc1f7536f6cff710c1aaeb286d8bda39417ac8db68de291b17f67dc"],
  };
  for (const [sourceKind, [bytes, sha256]] of Object.entries(expected)) {
    assert.equal(evidence.sourceInputs[sourceKind].bytes, bytes, sourceKind);
    assert.equal(evidence.sourceInputs[sourceKind].sha256, sha256, sourceKind);
    assert.equal(
      evidence.sourceInputs[sourceKind].byteRepeatableAcrossTwoGenerations,
      true,
      sourceKind,
    );
  }
});

test("browser coverage uses genuine sources and exact multi-stream validators", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const fixture of [
    "complex-legacy-source.avi",
    "complex-web-source.webm",
    "complex-ogg-source.ogv",
  ]) {
    assert.ok(source.includes(fixture), fixture);
  }
  for (const assertion of [
    "expectCompressedVideoPacketMatch",
    "expectSubtitlePacketMatch",
    "expectDecodedVideoMatch",
    "probe.chapters).toHaveLength(2)",
  ]) {
    assert.ok(source.includes(assertion), assertion);
  }
  for (const audioStreamIndex of [0, 1]) {
    assert.match(
      source,
      new RegExp(
        `expectCompressedAudioPacketMatch\\(\\s*route\\.sourcePath,\\s*outputPath,\\s*${audioStreamIndex}\\s*,?\\s*\\)`,
      ),
    );
  }
  assert.equal(source.includes("complexMatroskaAsWebmFixturePath"), false);
  assert.equal(source.includes("copyFile(complexFixturePath"), false);
  assert.ok((source.match(/"-fflags",\s*"\+bitexact"/g) ?? []).length >= 2);
  assert.ok(source.includes("Object.values(complexLegacyWebSourceFixturePaths)"));
  assert.ok(source.includes("Object.values(complexLegacyWebSourceOutputPaths)"));
});

test("the checkpoint is linked, cleaned, and still honestly partial", async () => {
  for (const relativePath of [
    "README.md",
    "TESTED.md",
    "REMAINING_WORK.md",
    "scripts/generate-tested-ledger.mjs",
  ]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(source.includes(evidenceName), relativePath);
  }
  assert.match(evidence.scope, /M-03 remains partial only/);
  assert.match(evidence.scope, /attached-picture disposition/);
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
  assert.equal(evidence.cleanup.generatedSourceFixturesRetained, 0);
  assert.equal(evidence.cleanup.diagnosticCopiesRetained, 0);
});
