import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadArtworkSerializerBenchmark, summarizeArtworkSerializerBenchmarks } from "../scripts/lib/audio-artwork-serializer-benchmark.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("actual predeclared A/B/B/A validates28 unchanged outputs and2044 whole-tree samples but does NOT manufacture a browser speed win", async () => {
  const plan = JSON.parse(await readFile(path.join(root, "evidence/audio-artwork-serializer-bracket-2026-10-25-v1.json")));
  assert.equal(plan.status, "complete-no-consistent-browser-speedup"); assert.equal(plan.order, "A/B/B/A");
  assert.deepEqual(plan.runs.map(row => row.engine), ["baseline", "candidate", "candidate", "baseline"]);
  assert.equal(plan.selectedEngine, "baseline"); assert.equal(plan.noRerunToSelectFasterOrPassingResults, true);
  const loaded = [];
  for (const run of plan.runs) {
    assert.equal(run.status, "qualified-seven-jobs"); const value = await loadArtworkSerializerBenchmark(root, run.receipt);
    assert.ok(Date.parse(plan.predeclaredAt) < Date.parse(value.report.startedAt));
    assert.equal(value.report.memory.incrementalPrivateMiB, run.incrementalPrivateMiB);
    assert.equal(value.report.memory.validSamples, run.validSamples); assert.equal(value.report.memory.unavailableSamples, 0);
    loaded.push(value);
  }
  const derived = summarizeArtworkSerializerBenchmarks(loaded.map(value => value.report));
  const retained = JSON.parse(await readFile(path.join(root, plan.comparison))), { startedAt, evidence, ...summary } = retained;
  assert.ok(Date.parse(startedAt) > Date.parse(loaded.at(-1).report.finishedAt));
  assert.deepEqual(summary, derived); assert.deepEqual(evidence, loaded.map(value => value.evidence));
  assert.equal(derived.validatedOutputs, 28); assert.equal(derived.measuredJobsPerEngine, 12);
  assert.equal(derived.runs.reduce((total, run) => total + run.validMemorySamples, 0), 2044);
  assert.equal(derived.engineTiming.baselineMedianMs, 189.1325000077486);
  assert.equal(derived.engineTiming.candidateMedianMs, 190.43750001490116);
  assert.ok(derived.engineTiming.observedMedianSpeedup < 1);
  assert.ok(derived.engineTiming.bracketMedianSpeedups[0] > 1 && derived.engineTiming.bracketMedianSpeedups[1] < 1);
  assert.equal(derived.conclusion, "no-consistent-end-to-end-engine-speedup-demonstrated-on-this-fixture");
  for (const flag of ["publicAcceptance", "longFileSpeedVerified", "scalingAcceptance", "fastestClaim", "headedCoverage"])
    assert.equal(derived[flag], false);
  assert.ok(loaded.every(value => value.report.cases.every(row => row.physicalValidation.convertedCopyCreated === false)));
});

test("nonwinning candidate cleanup is restricted to the exact audited cache, never public engines or protected media", async () => {
  const source = await readFile(path.join(root, "scripts/cleanup-audio-ogg-artwork-lower-copy.mjs"), "utf8");
  assert.match(source, /work\/audio-ogg-artwork-lower-copy-40161703799/);
  assert.match(source, /6457c3499800db5d8275d08ead789637546c68e8d75fc4ccf21b893eeba57609/);
  assert.match(source, /actualNames, expectedNames/); assert.match(source, /before.dev, current.dev/); assert.match(source, /before.ino, current.ino/);
  assert.match(source, /await rm\(directory, \{ recursive: true \}\)/);
  assert.match(source, /total, 10449553/); assert.doesNotMatch(source, /taskkill|spawn\(|execFile\(/);
  const build = JSON.parse(await readFile(path.join(root, "evidence/audio-ogg-artwork-lower-copy-build-2026-10-25-v1.json")));
  assert.equal(build.collected.manifestSha256, "6457c3499800db5d8275d08ead789637546c68e8d75fc4ccf21b893eeba57609");
  const native = JSON.parse(await readFile(path.join(root, "outputs/reports/2026-10-25T04-21-54.520Z-audio-ogg-lower-copy-native.json")));
  assert.equal(native.browserConversionVerified, false);
  for (const [file, expected] of Object.entries(native.sources))
    assert.equal(createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"), expected);
});

test("actual removed cache receipt retains recovery sources and baseline, without claiming source/report deletion", async () => {
  const receipt = JSON.parse(await readFile(path.join(root, "evidence/audio-ogg-artwork-lower-copy-cache-cleanup-2026-10-25-v1.json")));
  assert.equal(receipt.status, "removed-exact-owned-nonwinning-cache"); assert.equal(receipt.bytes, 10449553); assert.equal(receipt.files.length, 16);
  assert.equal(receipt.sourceAndReportsRetained, true); assert.equal(receipt.publicAssetsTouched, false); assert.equal(receipt.protectedOriginalTouched, false);
  assert.equal(receipt.recovery.buildRun, 40161703799); assert.equal(receipt.recovery.buildCommit, "e361f463ca1af9d2238f2466ddbbb817fb8c7142");
  assert.ok(Date.parse(receipt.removedAt) >= Date.parse(receipt.recordedAt));
  await assert.rejects(lstat(path.join(root, receipt.directory)), { code: "ENOENT" });
  assert.ok((await readFile(path.join(root, receipt.recovery.rebuildRecipe))).length > 0);
});
