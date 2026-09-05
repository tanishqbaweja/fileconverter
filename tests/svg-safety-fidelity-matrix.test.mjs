import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrix = JSON.parse(
  await readFile(
    path.join(projectRoot, "evidence", "svg-safety-fidelity-matrix-2026-09-05.json"),
    "utf8",
  ),
);

const requiredFeatures = [
  "geometry-paint-gradients-clipping",
  "filters",
  "masks",
  "text-fonts",
  "css",
  "animation",
  "links-external-resources",
  "scripts-event-handlers",
  "use-expansion",
  "xml-active-constructs",
  "png-output-fidelity",
];

test("N-05 matrix accounts for every named SVG behavior exactly once", () => {
  assert.equal(matrix.requirement, "N-05");
  assert.deepEqual(
    matrix.features.map((feature) => feature.id),
    requiredFeatures,
  );
  assert.equal(
    new Set(matrix.features.map((feature) => feature.id)).size,
    requiredFeatures.length,
  );
  for (const feature of matrix.features) {
    assert.ok(
      ["supported", "intentionally-rejected", "output-loss"].includes(
        feature.status,
      ),
      feature.id,
    );
    assert.ok(feature.behavior.length >= 48, feature.id);
  }
});

test("the public SVG route shows exactly the audited safety and fidelity disclosures", () => {
  const svgProfiles = conversionProfiles.filter(
    (profile) => profile.input === "svg" || profile.output === "svg",
  );
  assert.deepEqual(svgProfiles.map((profile) => profile.id), [matrix.profileId]);
  const profile = svgProfiles[0];
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.deepEqual(
    [...profile.metadataLimitations, ...profile.fidelityLimitations],
    matrix.registryDisclosures,
  );
});

test("the matrix is anchored to current worker, browser, fixture, and manifest sources", async () => {
  for (const evidence of matrix.directEvidence) {
    const source = await readFile(path.join(projectRoot, evidence.path), "utf8");
    for (const snippet of evidence.snippets) {
      assert.ok(
        source.includes(snippet),
        `${evidence.path}: missing ${JSON.stringify(snippet)}`,
      );
    }
  }

  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, matrix.engine.manifest), "utf8"),
  );
  assert.equal(manifest.resvgWasmVersion, "2.6.2");
  assert.equal(manifest.wasmBytes, matrix.engine.wasmBytes);
  assert.equal(manifest.wasmSha256, matrix.engine.wasmSha256);
  for (const [name, value] of Object.entries(matrix.fixedBounds)) {
    if (name === "maximumBlurDeviationPixels") continue;
    assert.equal(manifest[name], value, name);
  }
});

test("the final effects report proves three repeatable bounded 6-megapixel runs", async () => {
  const report = JSON.parse(
    await readFile(path.join(projectRoot, matrix.stress.report), "utf8"),
  );
  assert.equal(report.profileId, matrix.profileId);
  assert.equal(report.passed, true);
  assert.equal(report.source.bytes, matrix.stress.sourceBytes);
  assert.equal(report.source.width, matrix.stress.width);
  assert.equal(report.source.height, matrix.stress.height);
  assert.equal(report.source.width * report.source.height, matrix.stress.pixels);
  assert.equal(report.source.elements, matrix.stress.elements);
  assert.equal(report.source.filters, matrix.stress.filters);
  assert.equal(report.source.masks, matrix.stress.masks);
  assert.equal(report.source.filterPrimitives, matrix.stress.filterPrimitives);
  assert.equal(report.runs.length, matrix.stress.runs);
  assert.deepEqual(
    report.runs.map((run) => run.elapsedMs),
    matrix.stress.elapsedMilliseconds,
  );
  assert.equal(
    report.incrementalPrivateMiB,
    matrix.stress.worstIncrementalPrivateMiB,
  );
  assert.equal(report.limitMiB, matrix.stress.limitMiB);
  assert.ok(report.incrementalPrivateMiB <= report.limitMiB);
  assert.equal(report.checks.cleanupRecovery, matrix.stress.cleanupRecovery);
  assert.equal(new Set(report.runs.map((run) => run.sha256)).size, 1);
  assert.ok(
    report.runs.every(
      (run) =>
        run.outputBytes === matrix.stress.outputBytes &&
        run.sha256 === matrix.stress.repeatableOutputSha256 &&
        run.validationBytes === run.outputBytes &&
        run.validationSha256 === run.sha256 &&
        run.maxReadChunkBytes <= matrix.stress.maximumReadChunkBytes &&
        run.maxWriteChunkBytes <= matrix.stress.maximumWriteChunkBytes &&
        run.peakQueuedBytes <= matrix.stress.maximumQueuedBytes &&
        run.peakPendingOperations <= matrix.stress.maximumPendingOperations &&
        run.mediaProbe.withinValidation.decodedByNativeFfmpeg === true &&
        run.mediaProbe.withinValidation.firstFrameVisualSsim >=
          matrix.stress.minimumObservedReferenceSsim,
    ),
  );
});
