import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(
  projectRoot,
  "evidence",
  "webcodecs-acceleration-audit-2026-09-07.json",
);
const evidence = JSON.parse(await readFile(evidencePath, "utf8"));

test("M-09 records a measured WebCodecs adoption decision", () => {
  assert.equal(evidence.requirement, "M-09");
  assert.equal(evidence.status, "intentionally-unsupported-current-media-route");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.productionBrowserBenchmark.browser, "Google Chrome");
  assert.equal(evidence.productionBrowserBenchmark.version, "152.0.7977.77");
  assert.equal(evidence.productionBrowserBenchmark.result, "1 passed");
  assert.equal(
    evidence.productionBrowserBenchmark.capabilities.video.vp9.preferHardware,
    true,
  );
  assert.equal(evidence.productionBrowserBenchmark.capabilities.audio.opus, true);
  assert.equal(evidence.productionBrowserBenchmark.capabilities.audio.flac, false);
  assert.equal(evidence.revisitConditions.length, 5);
});

test("the production benchmark is bounded and repeatable", () => {
  const runs = evidence.productionBrowserBenchmark.boundedPrimitiveRuns;
  for (const candidate of Object.values(runs)) {
    assert.equal(candidate.elapsedMs.length, 3);
    assert.ok(candidate.elapsedMs.every((value) => value > 0));
    assert.equal(new Set(candidate.fnv1a32PerRun).size, 1);
    assert.ok(candidate.chunksPerRun > 0);
    assert.ok(candidate.bytesPerRun > 0);
    assert.ok(candidate.maximumChunkBytes <= 262_144);
    assert.ok(candidate.peakEncodeQueue <= 3);
  }
  assert.equal(
    evidence.productionBrowserBenchmark.boundedness.convertedFilesCreated,
    0,
  );
  assert.equal(
    evidence.productionBrowserBenchmark.boundedness.fixtureFilesCreated,
    0,
  );
});

test("benchmark source retains explicit queue and resource release bounds", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests", "browser", "webcodecs-acceleration.spec.ts"),
    "utf8",
  );
  assert.match(source, /while \(encoder\.encodeQueueSize > 2\)/);
  assert.match(source, /peakEncodeQueue.*toBeLessThanOrEqual\(3\)/s);
  assert.match(source, /frame\.close\(\)/);
  assert.match(source, /data\.close\(\)/);
  assert.match(source, /hardwareAcceleration: "prefer-hardware"/);
  assert.doesNotMatch(source, /const\s+outputChunks\s*=\s*\[/);
});

test("WebCodecs is not advertised as a dependency of an uncertified media route", () => {
  const leaked = conversionProfiles.filter((profile) =>
    profile.browserRequirements.includes("WebCodecs"),
  );
  assert.deepEqual(leaked, []);
});

test("the decision is documented and tied to primary standards", async () => {
  assert.ok(evidence.sources.length >= 4);
  assert.ok(
    evidence.sources.every((source) => source.url.startsWith("https://www.w3.org/")),
  );
  for (const relativePath of [
    "README.md",
    "TESTED.md",
    "REMAINING_WORK.md",
    "scripts/generate-tested-ledger.mjs",
  ]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(
      source.includes("webcodecs-acceleration-audit-2026-09-07.json"),
      relativePath,
    );
  }
});
