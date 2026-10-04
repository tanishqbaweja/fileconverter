import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { summarizeCpuProfile } from "./lib/cpu-profile-summary.mjs";
const root = path.resolve(import.meta.dirname, "..");
const rawReport = process.argv[2];
assert.match(rawReport, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-cpu-diagnostic\.json$/);
const rawBytes = await readFile(path.join(root, rawReport)), report = JSON.parse(rawBytes);
assert.equal(report.status, "passed-instrumented-cpu-diagnostic-only");
assert.equal(report.publicAcceptance, false); assert.equal(report.requestedRunCount, 1);
assert.equal(report.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
assert.equal(report.source.bytes, 105000218);
const diagnostic = report.cpuDiagnostic;
assert.match(diagnostic.rawPath, /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-720p-cpu-diagnostic\.cpuprofile$/);
assert.ok((await stat(path.join(root, diagnostic.rawPath))).size <= 16 * 1024 ** 2);
const cpuBytes = await readFile(path.join(root, diagnostic.rawPath)), profile = JSON.parse(cpuBytes);
assert.equal(createHash("sha256").update(cpuBytes).digest("hex"), diagnostic.rawSha256);
assert.deepEqual(summarizeCpuProfile(profile), diagnostic.summary);
assert.equal(report.runs[0].independentValidation.outputSha256, "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636");
assert.ok(report.runs[0].incrementalPrivateMiB <= 250);
assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
assert.equal(report.cleanup.generatedDistRestored, true);
const files = ["scripts/lib/cdp-cpu-window.mjs", "scripts/lib/cpu-profile-summary.mjs", "scripts/h264-private-memory.mjs", "scripts/record-h264-cpu-diagnostic.mjs"];
const currentSources = Object.fromEntries(await Promise.all(files.map(async (file) => [file,
  createHash("sha256").update(await readFile(path.join(root, file))).digest("hex")])));
const evidence = {
  recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "bounded-worker-cpu-hotspots-measured-not-speed-acceptance",
  rawReport, rawReportSha256: createHash("sha256").update(rawBytes).digest("hex"),
  report, rawCpuProfile: { path: diagnostic.rawPath, sha256: diagnostic.rawSha256, bytes: cpuBytes.length, profile },
  currentSourcesScope: "Latest source indexes; raw report preserves as-executed hashes. Subsequent console-label and indentation corrections do not rewrite historical execution.",
  currentSources,
  sourceInvestigation: [
    { url: "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/processing/src/vaacalc/vaacalcfuncs.cpp",
      bytes: 19566, sha256: "69a57a09170a613b472a28f339bf54e72a82c2d46bc0c69e62d0abb676353b3a",
      finding: "VAACalcSadBgd_c calculates per-8x8 unsigned SAD, signed difference sum and maximum absolute difference over macroblocks. Raw source lines 486-595 identify the sampled scalar loop." },
    { url: "https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/encoder/core/src/sample.cpp",
      bytes: 24258, sha256: "13b93c0c7e4430a916f383df73b6450daf6511965f0e46e336ddf61e40ed514e",
      finding: "WelsInitSampleSadFunc initially selects scalar SAD/SATD functions, with optimized architecture paths guarded separately. This is source inspection, not proof of a faster Wasm implementation." }
  ],
  conclusion: "Measured first-window hotspot is OpenH264 encoder stacks, particularly scalar background/SAD analysis. Do not infer Asyncify overhead from inclusive wrapper stacks or call sampled wall-time OS CPU utilization. Do not repeat unchanged I/O/LTO tuning as the next speed candidate.",
  nextInvestigation: "Evaluate an exact-arithmetic Wasm SIMD implementation of the pinned background/SAD loop, preserving all outputs and codec settings. Require exhaustive scalar equivalence before a bounded-browser identical-input speed A/B; no quality heuristic disable or public adoption without original gates.",
  publicAcceptance: false, publicProfilesChanged: false,
};
const output = path.join(root, "evidence/h264-cpu-diagnostic-2026-10-04.json");
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${output}\n`);
