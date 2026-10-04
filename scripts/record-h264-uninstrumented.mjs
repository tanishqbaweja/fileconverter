import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { startupConversionOverlap } from "./lib/h264-stress-profile.mjs";

const root = path.resolve(import.meta.dirname, ".."), relative = process.argv[2];
assert.match(relative ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-startup-scaling-memory(-direct-handle)?\.json$/);
assert.ok((await stat(path.join(root, relative))).size < 16 * 1024 ** 2);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const raw = await readFile(path.join(root, relative)), report = JSON.parse(raw);
assert.equal(report.candidateName, "h264-uninstrumented-candidate-output");
assert.equal(report.publicAcceptance, false); assert.equal(report.publicProfilesChanged, false);
assert.equal(report.cpuEnabled, false); assert.deepEqual(report.allocatorSamples, []);
assert.equal(report.fixtureDurationSeconds, 600); assert.equal(report.requestedRunCount, 3);
assert.equal(report.source.bytes, 1050296904);
assert.equal(report.source.sha256, "031f4cdf9a40bbeacd84c2c1c4640565d37d96e600cdcb31fece6becf2b5ac12");
assert.equal(report.source.frameTimes.length, 18000);
assert.ok(["sync-opfs", "direct-handle"].includes(report.destinationMode));
const manifest = report.asBuiltManifest;
assert.equal(manifest.allocatorDiagnostic, false);
assert.equal(manifest.openh264SadSimd, true); assert.equal(manifest.openh264VaaSimd, false);
assert.equal(manifest.libraryLinkTimeOptimization, false);
assert.equal(manifest.initialWasmMemoryBytes, 33554432);
assert.equal(manifest.maximumWasmMemoryBytes, 33554432); assert.equal(manifest.allowMemoryGrowth, false);
assert.equal(manifest.genericDemuxIndexHintBytesPerStream, 32768);
assert.equal(manifest.candidateKernelSha256, "a6283ed5ee3080044ccabf2d79e8009e680bfb0d9aa26420b3359af25cb682a9");
assert.equal(report.primaryLimitMiB, 250);
assert.equal(report.formula, "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory");
assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes > 0);
assert.ok(report.samples.length <= 4096 && report.runs.length >= 1 && report.runs.length <= 3);
for (const [file, expected] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), expected, file);
for (const run of report.runs) {
  const active = report.samples.filter((s) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(s.phase) && s.privateBytes != null);
  assert.ok(active.length > 2);
  for (const sample of active) {
    assert.ok(sample.privateBytes > 0 && sample.processes?.length > 0);
    assert.ok(sample.processes.every((p) => Number.isFinite(p.privateBytes) && p.privateBytes > 0));
    assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
  }
  const peak = Math.max(...active.map((s) => s.privateBytes));
  assert.equal(run.peakPrivateBytes, peak); assert.equal(run.completeTreeSamples, active.length);
  assert.equal(run.incrementalPrivateMiB, (peak - report.blankBaseline.privateBytes) / 1024 ** 2);
  const metrics = run.state.metrics;
  assert.equal(metrics.peakWasmMemoryBytes, 33554432);
  assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144);
  assert.ok(metrics.peakQueuedBytes <= 262144 && metrics.peakPendingOperations <= 1);
  assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
}
assert.deepEqual(report.forbiddenRequests, []);
assert.deepEqual(report.startupOverlap, startupConversionOverlap(report.samples));
if (report.status === "passed-private-startup-scaling-gate") {
  assert.equal(report.runs.length, 3); assert.equal(report.startupOverlap.observed, true);
  for (const run of report.runs) {
    assert.equal(run.state.jobState, "complete"); assert.ok(run.incrementalPrivateMiB <= 250);
    if (report.destinationMode === "direct-handle") assert.equal(run.state.opfsName, null);
    else assert.ok(run.state.opfsName);
    const validation = run.independentValidation;
    assert.equal(validation.outputProbe.streams[0].codec_name, "h264");
    assert.deepEqual([validation.outputProbe.streams[0].width, validation.outputProbe.streams[0].height], [1280, 720]);
    assert.equal(validation.outputFrameTimes.length, 18000);
    assert.equal(validation.fullDecodePassed, true);
    assert.ok(validation.ordinalSsim >= 0.98 && validation.maximumFrameTimeErrorSeconds <= 0.001);
    assert.deepEqual(validation.audioPacketHashes, report.source.audioPacketHashes);
    assert.deepEqual(run.cleanup.opfsRemainingEntries, []); assert.ok(run.cleanup.deltaFromLoadedMiB <= 96);
  }
  assert.equal(new Set(report.runs.map((r) => r.independentValidation.outputSha256)).size, 1);
} else { assert.equal(report.status, "failed"); assert.ok(report.failure?.message); }
assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
assert.equal(report.cleanup.generatedDistRestored, true);
const exec = promisify(execFile), gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const runGh = (args) => exec(gh, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 });
const runId = "37219282953";
const { stdout: runText } = await runGh(["run", "view", runId, "--repo", "tanishqbaweja/fileconverter", "--json", "status,conclusion,headSha,jobs,url"]);
const build = JSON.parse(runText);
assert.equal(build.status, "completed"); assert.equal(build.conclusion, "success");
assert.equal(build.headSha, "71abba203dc8b384ca6462fce694f650b907da77");
assert.equal(build.jobs[0].steps.find((s) => s.name === "Remove repository-local build data").conclusion, "success");
const { stdout: artifacts } = await runGh(["api", `repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`]);
assert.equal(JSON.parse(artifacts).total_count, 0);
const { stdout: log } = await runGh(["run", "view", runId, "--repo", "tanishqbaweja/fileconverter", "--log"]);
assert.ok(log.includes('WITHIN_H264_ALLOCATOR_DIAGNOSTIC="0"'));
const { stdout: chrome } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "@(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fileconverter*' }).Count"], { windowsHide: true });
assert.equal(Number(chrome.trim()), 0);
const staticTools = [], buildCaches = [];
for (const directory of await readdir(path.join(root, "work"))) {
  if (directory === ".gitkeep") continue;
  if (directory === "node-compile-cache") {
    const cache = path.join(root, "work", directory); let bytes = 0, files = 0;
    assert.equal((await lstat(cache)).isSymbolicLink(), false);
    for (const version of await readdir(cache)) {
      assert.match(version, /^v24\.7\.0-x64-[a-f0-9]{8}$/);
      assert.equal((await lstat(path.join(cache, version))).isSymbolicLink(), false);
      for (const file of await readdir(path.join(cache, version))) {
        assert.match(file, /^[a-f0-9]{8}$/);
        const info = await lstat(path.join(cache, version, file)); assert.ok(info.isFile() && !info.isSymbolicLink());
        bytes += info.size; files++;
      }
    }
    assert.ok(bytes <= 1024 ** 2 && files <= 256);
    buildCaches.push({ path: "work/node-compile-cache", bytes, files,
      containsConvertedMedia: false, retainedDueToPriorDeletionPolicyBlock: true, newDeletionAttempted: false });
    continue;
  }
  assert.match(directory, /^h264-(candidate-output|speed-baseline-37157670815|dimension-baseline-37155139021|rejected-lto-37159386013|sad-candidate-output|allocator-candidate-output|index-candidate-output|uninstrumented-candidate-output)$/);
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
const priorPath = "evidence/h264-demux-index-diagnostic-2026-10-04.json";
const prior = await readFile(path.join(root, priorPath));
const currentSources = Object.fromEntries(await Promise.all([
  "scripts/record-h264-uninstrumented.mjs", "scripts/h264-private-memory.mjs",
  "scripts/lib/h264-candidate-selection.mjs", "media/ffmpeg/h264-candidate.c",
].map(async (file) => [file, sha(await readFile(path.join(root, file)))])));
const evidence = { recordedAt: new Date().toISOString(), requirement: "M-04", publicAcceptance: false,
  status: "uninstrumented-private-long-result-not-public-certification",
  build: { ...build, logSha256: sha(log), sourceBundleDownloaded: false, hostedArtifactsRemaining: 0 },
  priorInstrumentedResult: { path: priorPath, sha256: sha(prior) },
  report: { path: relative, sha256: sha(raw), data: report }, currentSources,
  privateGatePassed: report.status === "passed-private-startup-scaling-gate",
  limitations: ["No public or speed A/B acceptance", "Direct adapter, if used, selects real OPFS handle, not native OS picker or another physical drive",
    "Adverse, larger-source, control/fidelity, legal and publication gates remain separate"],
  cleanup: { staticTools, staticToolBytes: staticTools.reduce((n, t) => n + t.bytes, 0), buildCaches,
    convertedMediaBytesInWork: 0, ownedBenchmarkChromeProcesses: 0, hostedArtifactsRemaining: 0, distHashes },
};
const output = `evidence/h264-uninstrumented-${report.destinationMode}-${report.recordedAt.slice(0, 10)}.json`;
await writeFile(path.join(root, output), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output, status: report.status, runs: report.runs.map((r) => ({
  run: r.run, state: r.state.jobState, incrementalPrivateMiB: r.incrementalPrivateMiB,
  validated: Boolean(r.independentValidation), recovered: Boolean(r.cleanup) })), cleanup: evidence.cleanup }, null, 2)}\n`);
