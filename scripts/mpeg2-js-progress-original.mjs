// ONE new diagnostic: actual conversion JS profiles before worker cancellation.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { extractPinnedSplitAdapter } from "./lib/mpeg2-abort-original-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "./lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makePartialBlinkAttribution } from "./lib/partial-blink-attribution-recipe.mjs";
import { makeJsProgressOriginalDriver } from "./lib/mpeg2-js-progress-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file), "utf8"), json = async file => JSON.parse(await read(file));
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--prepare-only"));
const prepare = process.argv[2] === "--prepare-only", stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const prior = await json("evidence/mpeg2-hero-width-original-2026-10-08.json");
assert.equal(prior.nativePeakIncrementalMiB, 256.43359375); assert.equal(prior.completeOriginalConversions, 0);
for (const [file, digest] of Object.entries(prior.sourcePins)) assert.equal(sha(await read(file)), digest, file);
const tooling = await json("evidence/ui-js-allocation-tooling-2026-10-08.json");
assert.equal(tooling.jsSourceLocationsObserved, true); assert.equal(tooling.nativeAllocationCauseProven, false);
assert.equal(tooling.runtimeDirectoriesAbsent, true);
for (const [file, digest] of Object.entries(tooling.sourcePins)) assert.equal(sha(await read(file)), digest, file);
const golden = await json("evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json");
assert.equal(golden.status, "passed-5-of-5-private-regression");
for (const [file, digest] of Object.entries(golden.sourcePins)) assert.equal(sha(await read(file)), digest, file);
const stager = await read("scripts/stage-mpeg2-split-direct.mjs"), stackHelper = await read("scripts/lib/bounded-wasm-abort-capture.mjs");
const { adapter: lateAdapter } = makeLateAllocatorAbortAdapter({ stager, stackHelper,
  snapshotHelper: await read("scripts/lib/late-refstruct-abort-snapshot.mjs"), poolHelper: await read("scripts/lib/late-pool-abort-capture.mjs"),
  controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
  allocatorHelper: await read("scripts/lib/late-pool-allocator-abort-capture.mjs"), freeHeaderHelper: await read("scripts/lib/dlmalloc-free-header-inspection.mjs"),
  allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"), layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") });
const input = await read("scripts/mpeg2-split-single-navigation-memory.mjs");
const make = helperUrl => makeJsProgressOriginalDriver(input, root, s => import.meta.resolve(s),
  extractPinnedSplitAdapter(stager), stackHelper, helperUrl, lateAdapter);
const check = source => {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
};
const sourceFiles = [...new Set([...Object.keys(prior.sourcePins), ...Object.keys(tooling.sourcePins),
  "scripts/mpeg2-js-progress-original.mjs", "scripts/lib/mpeg2-js-progress-recipe.mjs", "scripts/lib/conversion-js-allocation.mjs",
  "tests/conversion-js-allocation.test.mjs", "tests/mpeg2-js-progress-recipe.test.mjs", "evidence/ui-js-allocation-tooling-2026-10-08.json"])];
const sourcePins = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await read(file))])));
if (prepare) {
  const generated = make("file:///owned/trace-helper.mjs"); check(generated);
  const proof = { recordedAt: new Date().toISOString(), status: "prepared-not-browser-executed", sourcePins,
    generatedBytes: Buffer.byteLength(generated), generatedSha256: sha(generated),
    sourcePinsVerified: sourceFiles.length, fullSourceAndAllAcceptanceGatesPreserved: true, browserExecutions: 0,
    publicAcceptance: false, primaryMemoryAcceptance: false, conversionSpeedAcceptance: false };
  const target = path.join(root, "evidence", `${stamp}-mpeg2-js-progress-preparation.json`);
  await writeFile(target, JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ target, status: proof.status, generatedBytes: proof.generatedBytes,
    generatedSha256: proof.generatedSha256, sourcePinsVerified: proof.sourcePinsVerified, browserExecutions: 0 }));
} else {
  const host = await inspectStressHostMemory(); console.log(JSON.stringify({ scope: "js-progress-full-original-preflight", host }));
  if (!host.safeToStart) { console.log("Held before source/profile/staging; no automatic retry"); process.exitCode = 1; }
  else {
    const runtime = await createOwnedRuntimeScratch("mpeg2-js-progress-driver-");
    const priorCandidate = process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
    assert.ok(!priorCandidate || priorCandidate === "mpeg2-split-pipeline-37739125738");
    process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR = "mpeg2-split-pipeline-37739125738";
    let result, generated, traceHelper;
    try {
      const tracePath = path.join(root, "outputs/reports", `${stamp}-js-progress-post-cancel-blink.json.gz`);
      traceHelper = makePartialBlinkAttribution(await read("scripts/lib/bounded-renderer-attribution.mjs"), root, tracePath);
      const traceFile = path.join(runtime.directory, "trace-helper.mjs"); await writeFile(traceFile, traceHelper, { flag: "wx" });
      generated = make(pathToFileURL(traceFile).href); check(generated);
      const target = path.join(runtime.directory, "original.mjs"); await writeFile(target, generated, { flag: "wx" });
      result = await import(pathToFileURL(target).href);
    } finally {
      await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" });
      if (priorCandidate === undefined) delete process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR;
      else process.env.WITHIN_MPEG2_SPLIT_CANDIDATE_DIR = priorCandidate;
    }
    for (const [file, digest] of Object.entries(sourcePins)) assert.equal(sha(await read(file)), digest, file);
    assert.ok(result?.completedReport && result.completedReportPath);
    assert.ok((await stat(result.completedReportPath)).size <= 32 * 1024 ** 2);
    const rawBytes = await readFile(result.completedReportPath), report = result.completedReport;
    const generatedBytes = Buffer.from(JSON.stringify({ generated, traceHelper })); assert.ok(generatedBytes.length <= 1048576);
    const generatedPath = path.join(root, "outputs/reports", `${stamp}-js-progress-executed-sources.json.gz`), compressed = gzipSync(generatedBytes, { level: 9 });
    await writeFile(generatedPath, compressed, { flag: "wx" });
    const receipt = { recordedAt: new Date().toISOString(), status: "terminal-full-original-js-progress-diagnostic-not-acceptance",
      rawStatus: report.status, sourcePins, host, generatedSourceSha256: sha(generated), generatedTraceHelperSha256: sha(traceHelper),
      generatedSourcesArchive: { path: path.relative(root, generatedPath).replaceAll("\\", "/"), bytes: compressed.length,
        sha256: sha(compressed), restoredBytes: generatedBytes.length, restoredSha256: sha(generatedBytes) },
      rawReport: { path: path.relative(root, result.completedReportPath).replaceAll("\\", "/"), bytes: rawBytes.length, sha256: sha(rawBytes) },
      driverRuntimeDirectory: runtime.directory, driverRuntimeRemoved: true, sourcePinsUnchanged: true,
      conversionJsReport: report.conversionJsReport, formula: report.formula, limitMiB: report.limitMiB, requestedRuns: report.requestedRuns,
      browserVersion: report.browserVersion, blankBaseline: report.blankBaseline, failure: report.failure, cleanup: report.cleanup,
      completeOriginalConversions: report.runs.filter(run => run.independentValidation && run.state?.jobState === "complete").length,
      publicAcceptance: false, primaryMemoryAcceptance: false, conversionSpeedAcceptance: false };
    const target = path.join(root, "evidence", `${stamp}-mpeg2-js-progress-receipt.json`);
    const bytes = JSON.stringify(receipt, null, 2) + "\n"; assert.ok(Buffer.byteLength(bytes) < 262144);
    await writeFile(target, bytes, { flag: "wx" }); console.log(JSON.stringify({ target, rawStatus: report.status,
      failure: report.failure?.message, profiles: report.conversionJsReport?.records.map(row => ({ phase: row.phase, status: row.status })), cleanup: report.cleanup }));
  }
}
