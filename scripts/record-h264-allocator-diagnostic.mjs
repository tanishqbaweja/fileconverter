import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { summarizeH264Allocator } from "./lib/h264-allocator-summary.mjs";

const root = path.resolve(import.meta.dirname, ".."), relative = process.argv[2];
assert.match(relative ?? "", /^outputs\/reports\/\d{4}-\d{2}-\d{2}T[\d-Z]+-private-h264-startup-scaling-memory\.json$/);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.ok((await stat(path.join(root, relative))).size < 4 * 1024 ** 2);
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
assert.ok(report.allocatorSamples.length > 1);
const allocator = summarizeH264Allocator(report.allocatorSamples);
for (const [file, expected] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), expected, file);
assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
assert.equal(report.cleanup.generatedDistRestored, true);
const exec = promisify(execFile), gh = "D:\\Program Files\\GitHub CLI\\gh.exe";
const runGh = (args) => exec(gh, args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 ** 2 });
const { stdout: text } = await runGh(["run", "view", "37196170055", "--repo", "tanishqbaweja/fileconverter", "--json", "status,conclusion,headSha,jobs,url"]);
const build = JSON.parse(text);
assert.equal(build.status, "completed"); assert.equal(build.conclusion, "success");
assert.equal(build.headSha, "af4ee8fa010fbf70f8b9da290c2380d7dc0b265d");
assert.equal(build.jobs[0].steps.find((s) => s.name === "Remove repository-local build data").conclusion, "success");
const { stdout: artifacts } = await runGh(["api", "repos/tanishqbaweja/fileconverter/actions/runs/37196170055/artifacts"]);
assert.equal(JSON.parse(artifacts).total_count, 0);
const { stdout: log } = await runGh(["run", "view", "37196170055", "--repo", "tanishqbaweja/fileconverter", "--log"]);
assert.ok(log.includes('WITHIN_H264_ALLOCATOR_DIAGNOSTIC="1"'));
const { stdout: chrome } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  "@(Get-CimInstance Win32_Process -Filter \"name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*fileconverter*' }).Count"], { windowsHide: true });
assert.equal(Number(chrome.trim()), 0);
const staticTools = [];
for (const directory of await readdir(path.join(root, "work"))) {
  if (directory === ".gitkeep") continue;
  assert.match(directory, /^h264-(candidate-output|speed-baseline-37157670815|dimension-baseline-37155139021|rejected-lto-37159386013|sad-candidate-output|allocator-candidate-output)$/);
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
const evidenceName = report.allocatorCaptureMode === "console-event" ? "h264-allocator-events-2026-10-04.json" : "h264-allocator-diagnostic-2026-10-04.json";
await writeFile(path.join(root, "evidence", evidenceName), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
const base = path.join(root, relative.replace(/\.json$/, "-allocator"));
await writeFile(`${base}.csv`, "inputBytes,outputBytes,dynamicBytes,freeBytes,unclaimedBytes,largestFreeLower,largestFreeExclusiveUpper,samplerElapsedUs\n" + report.allocatorSamples.map((s) => {
  const bucket = s.freeBlockSizeBuckets.findLastIndex((n) => n > 0);
  return [s.inputBytes, s.outputBytes, s.dynamicHeapBytes, s.freeDynamicBytes, s.unclaimedHeapBytes,
    bucket < 1 ? 0 : 2 ** bucket, bucket < 0 ? 0 : 2 ** (bucket + 1), s.samplerElapsedUs].join(",");
}).join("\n") + "\n", { flag: "wx" });
const end = Math.max(...report.allocatorSamples.map((s) => s.inputBytes));
const points = (pick) => report.allocatorSamples.map((s) => `${40 + s.inputBytes / end * 850},${280 - pick(s) / 33554432 * 240}`).join(" ");
await writeFile(`${base}.html`, `<!doctype html><meta charset="utf-8"><title>Private native allocator diagnostic</title><h1>Instrumented diagnostic, not acceptance</h1><p>Input bytes on X; 0–32 MiB native bytes on Y. Red: used including allocator overhead; green: free claimed; blue: unclaimed. Full Chromium acceptance remains separate.</p><svg viewBox="0 0 920 300"><polyline fill="none" stroke="red" points="${points((s) => s.dynamicHeapBytes - s.freeDynamicBytes)}"/><polyline fill="none" stroke="green" points="${points((s) => s.freeDynamicBytes)}"/><polyline fill="none" stroke="blue" points="${points((s) => s.unclaimedHeapBytes)}"/></svg><p>Snapshot/bucket bounds cannot identify individual retained allocations or prove the failed instant.</p>`, { flag: "wx" });
process.stdout.write(`${JSON.stringify(allocator, null, 2)}\n`);
