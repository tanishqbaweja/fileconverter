import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { conversionProfiles } from "../lib/capability-registry.ts";
import { mediaOutputFamily } from "../lib/media-conversion-plan.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "automatic-media-routing-2026-09-07.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("M-02 evidence inventories every current copy-plus-encode family", () => {
  assert.equal(evidence.requirement, "M-02");
  assert.equal(evidence.status, "verified-current-registry");
  assert.equal(evidence.dockerUsed, false);
  const actual = new Map();
  for (const profile of conversionProfiles.filter(
    (candidate) => candidate.public && candidate.engine.startsWith("ffmpeg-"),
  )) {
    const key = `${profile.input}:${mediaOutputFamily(profile.output)}`;
    const routes = actual.get(key) ?? new Set();
    routes.add(profile.route);
    actual.set(key, routes);
  }
  assert.deepEqual(
    [...actual]
      .filter(
        ([, routes]) =>
          routes.has("stream-copy") && routes.has("re-encode"),
      )
      .map(([key]) => key)
      .sort(),
    evidence.implementation.currentCopyAndEncodeFamilies
      .map((family) => `${family.input}:${family.destinationFamily}`)
      .sort(),
  );
});

test("browser evidence proves both retained copy and genuine fallback output", () => {
  const gate = evidence.browserGate;
  assert.equal(gate.focusedResult, "1 passed");
  assert.equal(gate.fullResult, "12 passed");
  assert.equal(gate.compatibleCase.route, "stream-copy");
  assert.equal(gate.compatibleCase.automaticSwitch, false);
  assert.equal(gate.fallbackCase.route, "decode-reencode");
  assert.equal(gate.fallbackCase.outputCodec, "mpeg4");
  assert.equal(gate.fallbackCase.completeNativeDecode, true);
  assert.equal(gate.fallbackCase.renamedExtensionExcluded, true);
  assert.equal(gate.bounds.maximumReadChunkBytes, 256 * 1024);
  assert.equal(gate.bounds.maximumWriteChunkBytes, 256 * 1024);
  assert.equal(gate.bounds.maximumQueuedBytes, 256 * 1024);
  assert.equal(gate.bounds.maximumPendingOperations, 1);
});

test("planner, UI, browser validator, and cleanup stay wired", async () => {
  const files = await Promise.all(
    [
      "lib/media-conversion-plan.ts",
      "app/converter/ConverterApp.tsx",
      "tests/browser/media-options.spec.ts",
      "scripts/cleanup-generated.mjs",
    ].map((relativePath) =>
      readFile(path.join(projectRoot, relativePath), "utf8"),
    ),
  );
  for (const anchor of [
    "selectAutomaticMediaProfile",
    "automatic-route-notice",
    "automatic-mpeg2-source.mkv",
    "nb_read_frames: \"96\"",
    "automatic-route-audit",
  ]) {
    assert.ok(files.some((source) => source.includes(anchor)), anchor);
  }
});

test("the evidence remains linked and its cleanup claim stays explicit", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
  assert.equal(evidence.cleanup.generatedSourceDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputDeleted, true);
  assert.equal(evidence.cleanup.failedAttemptTraceDeleted, true);
  assert.equal(evidence.cleanup.browserProfileDeleted, true);
});
