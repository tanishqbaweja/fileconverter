import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  conversionProfiles,
  detectFormat,
  formatById,
} from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const matrix = JSON.parse(
  await readFile(
    path.join(projectRoot, "evidence", "subtitle-field-matrix-2026-09-05.json"),
    "utf8",
  ),
);

const expectedProfiles = [
  "ass-to-srt",
  "ass-to-vtt",
  "srt-to-ass",
  "srt-to-ttml",
  "srt-to-vtt",
  "ttml-to-srt",
  "ttml-to-vtt",
  "vtt-to-ass",
  "vtt-to-srt",
  "vtt-to-ttml",
];

test("N-07 matrix covers every and only public subtitle route field", () => {
  assert.equal(matrix.requirement, "N-07");
  assert.equal(matrix.status, "directly indexed");
  assert.deepEqual(
    matrix.routes.map((route) => route.profileId).sort(),
    expectedProfiles,
  );
  assert.equal(new Set(matrix.routes.map((route) => route.profileId)).size, expectedProfiles.length);

  const publicSubtitleProfiles = conversionProfiles
    .filter(
      (profile) =>
        profile.public && formatById(profile.input)?.category === "subtitle",
    )
    .map((profile) => profile.id)
    .sort();
  assert.deepEqual(publicSubtitleProfiles, expectedProfiles);

  for (const route of matrix.routes) {
    assert.deepEqual(Object.keys(route.fields), matrix.fieldNames, route.profileId);
    for (const [field, behavior] of Object.entries(route.fields)) {
      assert.ok(
        matrix.allowedFieldStatuses.includes(behavior.status),
        `${route.profileId}:${field}: ${behavior.status}`,
      );
      assert.ok(behavior.detail.length >= 24, `${route.profileId}:${field}`);
    }
  }
});

test("every matrix disclosure is the exact public registry disclosure", () => {
  for (const route of matrix.routes) {
    const profile = conversionProfiles.find(
      (candidate) => candidate.id === route.profileId,
    );
    assert.ok(profile, route.profileId);
    assert.equal(profile.public, true, route.profileId);
    assert.equal(profile.automatedTestStatus, "passed", route.profileId);
    assert.deepEqual(
      [...profile.metadataLimitations, ...profile.fidelityLimitations].sort(),
      [...route.registryDisclosures].sort(),
      route.profileId,
    );
  }
});

test("matrix source anchors and the selected-profile disclosure surface exist", async () => {
  const evidenceItems = [
    matrix.disclosureSurface,
    ...matrix.aliases.evidence,
    ...matrix.routes.map((route) => route.browserEvidence),
  ];
  for (const evidence of evidenceItems) {
    const source = await readFile(path.join(projectRoot, evidence.path), "utf8");
    for (const snippet of evidence.snippets) {
      assert.ok(
        source.includes(snippet),
        `${evidence.path}: missing ${JSON.stringify(snippet)}`,
      );
    }
  }
});

test("ASS and SSA aliases resolve to one public bounded worker route family", () => {
  const format = formatById(matrix.aliases.canonicalFormat);
  assert.ok(format);
  assert.equal(format.label, matrix.aliases.label);
  assert.deepEqual(format.extensions, matrix.aliases.extensions);
  assert.deepEqual(format.mimeTypes, matrix.aliases.mimeTypes);
  for (const name of ["captions.ass", "captions.ASS", "captions.ssa", "captions.SSA"]) {
    assert.equal(detectFormat({ name, type: "" }), "ass", name);
  }
  for (const type of matrix.aliases.mimeTypes) {
    assert.equal(detectFormat({ name: "captions", type }), "ass", type);
  }
  assert.ok(
    conversionProfiles.some(
      (profile) => profile.public && profile.id === "ass-to-srt",
    ),
  );
  assert.ok(
    conversionProfiles.some(
      (profile) => profile.public && profile.id === "ass-to-vtt",
    ),
  );
});

test("all ten subtitle routes retain passed three-run bounded-memory cleanup evidence", async () => {
  let worstIncrementalPrivateMiB = 0;
  let largestSourceBytes = 0;
  for (const route of matrix.routes) {
    const report = JSON.parse(
      await readFile(path.join(projectRoot, route.stressReport), "utf8"),
    );
    const profile = conversionProfiles.find(
      (candidate) => candidate.id === route.profileId,
    );
    assert.equal(report.profileId, route.profileId);
    assert.equal(report.passed, true, route.profileId);
    assert.equal(report.runs.length, 3, route.profileId);
    assert.equal(report.limitMiB, matrix.stressSummary.limitMiB, route.profileId);
    assert.ok(report.incrementalPrivateMiB <= report.limitMiB, route.profileId);
    assert.equal(report.checks.cleanupRecovery, true, route.profileId);
    assert.equal(report.source.bytes, profile.maxTestedBytes, route.profileId);
    assert.ok(
      report.runs.every(
        (run) =>
          run.peakPendingOperations <= 1 &&
          run.peakQueuedBytes <= 256 * 1024 &&
          run.maxWriteChunkBytes <= 256 * 1024,
      ),
      `${route.profileId}: bounded write/backpressure metrics`,
    );
    worstIncrementalPrivateMiB = Math.max(
      worstIncrementalPrivateMiB,
      report.incrementalPrivateMiB,
    );
    largestSourceBytes = Math.max(largestSourceBytes, report.source.bytes);
  }
  assert.equal(
    worstIncrementalPrivateMiB,
    matrix.stressSummary.worstIncrementalPrivateMiB,
  );
  assert.equal(largestSourceBytes, matrix.stressSummary.largestSourceBytes);
  assert.equal(matrix.stressSummary.allRoutesHaveThreeRunProductionChromeReports, true);
  assert.equal(matrix.stressSummary.allCleanupRecoveryChecksPassed, true);
  assert.equal(matrix.stressSummary.convertedOutputsRetained, 0);
});
