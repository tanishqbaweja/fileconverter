import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { summarizeH264Allocator } from "./lib/h264-allocator-summary.mjs";
import { startupConversionOverlap } from "./lib/h264-stress-profile.mjs";

const root = path.resolve(import.meta.dirname, ".."), relative = process.argv[2];
const kind = process.argv[3] ?? "allocator";
assert.ok(["allocator", "index"].includes(kind));
const expectedBuild = kind === "index" ? {
  run: "37216461757", head: "aee6478b041bdca6bb5e5336bfcf649478cdc36c",
  kernel: "a6283ed5ee3080044ccabf2d79e8009e680bfb0d9aa26420b3359af25cb682a9",
} : {
  run: "37196170055", head: "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d",
  kernel: "6021062d1fcb1434b44840346e66402b178aa439165c4fef197bd6bcb645587b",
};
assert.match(relative ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-startup-scaling-memory\.json$/);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
// Long three-job reports retain every process sample and 18,000 PTS per output.
// This limits diagnostic artifact size, never conversion/private/Wasm memory.
assert.ok((await stat(path.join(root, relative))).size < (kind === "index" ? 16 : 4) * 1024 ** 2);
const raw = await readFile(path.join(root, relative)), report = JSON.parse(raw);
assert.equal(report.publicAcceptance, false); assert.equal(report.cpuEnabled, false);
assert.equal(report.fixtureDurationSeconds, 600); assert.equal(report.requestedRunCount, 3);
assert.equal(report.source.bytes, 1050296904);
assert.equal(report.source.sha256, "031f4cdf9a40bbeacd84c2c1c4640565d37d96e600cdcb31fece6becf2b5ac12");
assert.equal(report.source.frameTimes.length, 18000);
const manifest = report.asBuiltManifest;
assert.equal(manifest.allocatorDiagnostic, true);
assert.equal(manifest.openh264SadSimd, true);
assert.equal(manifest.openh264VaaSimd, false);
assert.equal(manifest.libraryLinkTimeOptimization, false);
assert.equal(manifest.initialWasmMemoryBytes, 33554432);
assert.equal(manifest.maximumWasmMemoryBytes, 33554432);
assert.equal(manifest.allowMemoryGrowth, false);
assert.equal(manifest.candidateKernelSha256, expectedBuild.kernel);
if (kind === "index") {
  assert.equal(report.candidateName, "h264-index-candidate-output");
  assert.equal(manifest.genericDemuxIndexHintBytesPerStream, 32768);
  assert.equal(report.allocatorCaptureMode, "console-event");
  assert.equal(report.allocatorCaptureError, null);
  for (const sample of report.allocatorSamples) {
    for (const key of ["demuxIndexEntries", "demuxIndexLogicalBytes", "inputIndexLimitBytes"])
      assert.ok(Number.isSafeInteger(sample[key]) && sample[key] >= 0, key);
    assert.equal(sample.inputIndexLimitBytes, 32768);
    assert.equal(sample.demuxIndexLogicalBytes, sample.demuxIndexEntries * 24);
  }
  assert.equal(report.primaryLimitMiB, 250);
  assert.equal(report.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes > 0);
  assert.ok(report.samples.length <= 4096 && report.runs.length >= 1 && report.runs.length <= 3);
  for (const run of report.runs) {
    const active = report.samples.filter((s) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(s.phase) && s.privateBytes != null);
    assert.ok(active.length > 2);
    for (const sample of active) {
      assert.ok(sample.privateBytes > 0 && sample.processes?.length > 0);
      assert.ok(sample.processes.every((p) => Number.isFinite(p.privateBytes) && p.privateBytes > 0));
      assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
    }
    const peak = Math.max(...active.map((s) => s.privateBytes));
    assert.equal(run.peakPrivateBytes, peak);
    assert.equal(run.incrementalPrivateMiB, (peak - report.blankBaseline.privateBytes) / 1024 ** 2);
    assert.equal(run.completeTreeSamples, active.length);
    const metrics = run.state.metrics;
    assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144);
    assert.ok(metrics.peakQueuedBytes <= 262144 && metrics.peakPendingOperations <= 1);
    assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
  }
  assert.deepEqual(report.forbiddenRequests, []);
  if (report.status === "passed-instrumented-allocator-diagnostic-only") {
    assert.equal(report.runs.length, 3);
    assert.deepEqual(report.startupOverlap, startupConversionOverlap(report.samples));
    assert.equal(report.startupOverlap.observed, true);
    for (const run of report.runs) {
      assert.equal(run.state.jobState, "complete");
      assert.ok(run.incrementalPrivateMiB <= 250);
      assert.equal(run.independentValidation.fullDecodePassed, true);
      assert.equal(run.independentValidation.outputFrameTimes.length, 18000);
      assert.ok(run.independentValidation.maximumFrameTimeErrorSeconds <= 0.001);
      assert.ok(run.independentValidation.ordinalSsim >= 0.98);
      assert.deepEqual(run.independentValidation.audioPacketHashes, report.source.audioPacketHashes);
      assert.deepEqual(run.cleanup.opfsRemainingEntries, []);
      assert.ok(run.cleanup.deltaFromLoadedMiB <= 96);
    }
    assert.equal(new Set(report.runs.map((r) => r.independentValidation.outputSha256)).size, 1);
  }
}
assert.ok(report.allocatorSamples.length > 1);
const allocator = summarizeH264Allocator(report.allocatorSamples);
for (const [file, expected] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), expected, file);
assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
assert.equal(report.cleanup.generatedDistRestored, true);
const exec = promisify(execFile), gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const runGh = (args) => exec(gh, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 });
const { stdout: text } = await runGh(["run", "view", expectedBuild.run, "--repo", "tanishqbaweja/fileconverter", "--json", "status,conclusion,headSha,jobs,url"]);
const build = JSON.parse(text);
assert.equal(build.status, "completed"); assert.equal(build.conclusion, "success");
assert.equal(build.headSha, expectedBuild.head);
assert.equal(build.jobs[0].steps.find((s) => s.name === "Remove repository-local build data").conclusion, "success");
const { stdout: artifacts } = await runGh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${expectedBuild.run}/artifacts`]);
assert.equal(JSON.parse(artifacts).total_count, 0);
const { stdout: log } = await runGh(["run", "view", expectedBuild.run, "--repo", "tanishqbaweja/fileconverter", "--log"]);
assert.ok(log.includes('WITHIN_H264_ALLOCATOR_DIAGNOSTIC="1"'));
const { stdout: chrome } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "@(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fileconverter*' }).Count"], { windowsHide: true });
assert.equal(Number(chrome.trim()), 0);
const staticTools = [];
const retainedBuildCaches = [];
for (const directory of await readdir(path.join(root, "work"))) {
  if (directory === ".gitkeep") continue;
  if (kind === "index" && directory === "node-compile-cache") {
    // An exact cache-only path; its prior deletion was policy-blocked. Do not
    // bypass that restriction or hide it as converted-media cleanup success.
    const cache = path.join(root, "work", directory);
    assert.equal((await lstat(cache)).isSymbolicLink(), false);
    let bytes = 0, files = 0;
    for (const version of await readdir(cache)) {
      assert.match(version, /^v24\.7\.0-x64-[a-f0-9]{8}$/);
      assert.equal((await lstat(path.join(cache, version))).isSymbolicLink(), false);
      for (const file of await readdir(path.join(cache, version))) {
        assert.match(file, /^[a-f0-9]{8}$/);
        const info = await lstat(path.join(cache, version, file));
        assert.ok(info.isFile() && !info.isSymbolicLink());
        bytes += info.size; files++;
      }
    }
    assert.ok(files <= 256 && bytes <= 1024 ** 2);
    retainedBuildCaches.push({ path: "work/node-compile-cache", bytes, files,
      containsConvertedMedia: false, deletionPolicyBlocked: true, alternativeDeletionAttempted: false });
    continue;
  }
  assert.match(directory, /^h264-(candidate-output|speed-baseline-37157670815|dimension-baseline-37155139021|rejected-lto-37159386013|sad-candidate-output|allocator-candidate-output|index-candidate-output)$/);
  let bytes = 0;
  for (const file of await readdir(path.join(root, "work", directory))) {
    assert.match(file, /^(within-h264\.(mjs|wasm|mjs\.symbols)|build-manifest\.json|config_components\.h|LICENSE\.(ffmpeg|openh264))$/);
    const info = await stat(path.join(root, "work", directory, file)); assert.ok(info.isFile()); bytes += info.size;
  }
  staticTools.push({ path: `work/${directory}`, bytes });
}
const distHashes = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm"]) {
  const hash = sha(await readFile(path.join(root, "dist/client/engines/remux", file)));
  assert.equal(hash, sha(await readFile(path.join(root, "public/engines/remux", file)))); distHashes[file] = hash;
}
const currentSources = Object.fromEntries(await Promise.all([
  "scripts/lib/h264-allocator-summary.mjs", "scripts/record-h264-allocator-diagnostic.mjs",
  "media/ffmpeg/h264-allocator-diagnostic.h", "scripts/lib/h264-allocator-instrumentation.mjs",
].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
const priorPath = "evidence/h264-startup-scaling-failure-2026-10-04.json";
const prior = await readFile(path.join(root, priorPath));
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04",
  status: "instrumented-native-allocator-diagnosis-not-acceptance", publicAcceptance: false,
  build: { ...build, logSha256: sha(log), remainingRemoteArtifacts: 0, sourceBundleDownloaded: false },
  priorUninstrumentedFailure: { path: priorPath, sha256: sha(prior) },
  report: { path: relative, sha256: sha(raw), data: report }, allocator, currentSources,
  interpretationLimits: ["Dynamic used includes allocator headers/overhead", "Buckets bound payload sizes; no exact largest-block size",
    "Snapshots are not an individual allocation trace or the failed instant", "Instrumented elapsed time is not speed evidence",
    "Neither allocator metrics nor a partial conversion replace full-tree memory and correctness acceptance"],
  cleanup: { staticTools, retainedStaticToolBytes: staticTools.reduce((n, s) => n + s.bytes, 0),
    convertedMediaBytesInWork: 0, ownedBenchmarkChromeProcesses: 0, hostedArtifactsRemaining: 0, distHashes },
};
if (kind === "index") evidence.cleanup.retainedBuildCaches = retainedBuildCaches;
if (kind === "index") {
  const priorEventsPath = "evidence/h264-allocator-events-2026-10-04.json";
  const previous = await readFile(path.join(root, priorEventsPath));
  evidence.priorUncappedDiagnostic = { path: priorEventsPath, sha256: sha(previous) };
  evidence.demuxIndex = {
    logicalBytesOnlyNotBackingAllocation: true, mandatoryFullIndexDemuxersBounded: false,
    configuredHintBytesPerStream: 32768,
    maximumObservedEntries: Math.max(...report.allocatorSamples.map((s) => s.demuxIndexEntries)),
    maximumObservedLogicalBytes: Math.max(...report.allocatorSamples.map((s) => s.demuxIndexLogicalBytes)),
    steadyStateLiveUsedDeltasByRun: report.runs.map(({ run }) => {
      const entries = report.allocatorSamples.filter((s) => s.phase === `conversion-${run}`);
      const begin = entries[1], end = entries.at(-1);
      return { run, snapshots: entries.length, deltaBytes: begin && end ?
        (end.dynamicHeapBytes - end.freeDynamicBytes) - (begin.dynamicHeapBytes - begin.freeDynamicBytes) : null };
    }),
    publicAcceptance: false,
  };
}
const evidenceName = kind === "index" ? `h264-demux-index-diagnostic-${report.recordedAt.slice(0, 10)}.json` :
  report.allocatorCaptureMode === "console-event" ? "h264-allocator-events-2026-10-04.json" : "h264-allocator-diagnostic-2026-10-04.json";
await writeFile(path.join(root, "evidence", evidenceName), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
const base = path.join(root, relative.replace(/\.json$/, "-allocator"));
await writeFile(`${base}.csv`, "inputBytes,outputBytes,dynamicBytes,freeBytes,unclaimedBytes,largestFreeLower,largestFreeExclusiveUpper,samplerElapsedUs" +
  (kind === "index" ? ",phase,sequence,demuxIndexEntries,demuxIndexLogicalBytes,inputIndexLimitBytes" : "") + "\n" + report.allocatorSamples.map((s) => {
  const bucket = s.freeBlockSizeBuckets.findLastIndex((n) => n > 0);
  const row = [s.inputBytes, s.outputBytes, s.dynamicHeapBytes, s.freeDynamicBytes, s.unclaimedHeapBytes,
    bucket < 1 ? 0 : 2 ** bucket, bucket < 0 ? 0 : 2 ** (bucket + 1), s.samplerElapsedUs];
  if (kind === "index") row.push(s.phase, s.sequence, s.demuxIndexEntries, s.demuxIndexLogicalBytes, s.inputIndexLimitBytes);
  return row.join(",");
}).join("\n") + "\n", { flag: "wx" });
const end = Math.max(...report.allocatorSamples.map((s) => s.inputBytes));
const points = (pick) => report.allocatorSamples.map((s) => `${40 + s.inputBytes / end * 850},${280 - pick(s) / 33554432 * 240}`).join(" ");
const logicalMax = kind === "index" ? Math.max(1, ...report.allocatorSamples.map((s) => s.demuxIndexLogicalBytes)) : 1;
const indexGraph = kind !== "index" ? "" : `<h2>Observed logical demux index bytes</h2><p>Separate Y scale: 0–${logicalMax} bytes. Not backing-allocation bytes or whole-Chromium memory. Each polyline is one job; X is input bytes.</p><svg viewBox="0 0 920 300">${report.runs.map(({ run }) => `<polyline fill="none" stroke="orange" points="${report.allocatorSamples.filter((s) => s.phase === `conversion-${run}`).map((s) => `${40 + s.inputBytes / end * 850},${280 - s.demuxIndexLogicalBytes / logicalMax * 240}`).join(" ")}"/>`).join("")}</svg>`;
await writeFile(`${base}.html`, `<!doctype html><meta charset="utf-8"><title>Private native allocator diagnostic</title><h1>Instrumented diagnostic, not acceptance</h1><p>Input bytes on X; 0–32 MiB native bytes on Y. Red: used including allocator overhead; green: free claimed; blue: unclaimed. Full Chromium acceptance remains separate.</p><svg viewBox="0 0 920 300"><polyline fill="none" stroke="red" points="${points((s) => s.dynamicHeapBytes - s.freeDynamicBytes)}"/><polyline fill="none" stroke="green" points="${points((s) => s.freeDynamicBytes)}"/><polyline fill="none" stroke="blue" points="${points((s) => s.unclaimedHeapBytes)}"/></svg><p>Snapshot/bucket bounds cannot identify individual retained allocations or prove the failed instant.</p>`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(allocator, null, 2)}\n`);
if (kind === "index") await writeFile(`${base}-index.html`, `<!doctype html><meta charset="utf-8"><title>Private demux index attribution</title><h1>Diagnostic, not acceptance</h1>${indexGraph}`, { flag: "wx" });
