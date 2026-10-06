import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { verifyMpeg2DecoderSet } from "../media/ffmpeg/mpeg2-decoder-selection.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";

const root = path.resolve(import.meta.dirname, "..");
const reportFile = "output/playwright/2026-10-06T09-55-07.390Z-mpeg2-split-pipeline-37444860342-artwork.json";
const slot = "work/mpeg2-split-pipeline-37444860342";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => readFile(path.join(root, file));
const raw = await read(reportFile), report = JSON.parse(raw);
const manifest = JSON.parse(await read(`${slot}/build-manifest.json`));
assert.deepEqual(report.manifest, manifest);
for (const [file, hash] of Object.entries(manifest.sources)) assert.equal(sha(await read(file)), hash, file);
for (const [file, hash] of Object.entries(manifest.artifacts)) assert.equal(sha(await read(`${slot}/${file}`)), hash, file);
for (const [role, file, pages] of [["decoderMux", "within-mpeg2-split.wasm", 512], ["encoder", "split-encoder.wasm", 256]]) {
  assert.deepEqual(readWasmMemoryLimits(await read(`${slot}/${file}`)), [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
  assert.deepEqual(manifest.memories[role], [{ imported: true, initialPages: pages, maximumPages: pages, shared: true }]);
}
const components = (await read(`${slot}/config_components.h`)).toString();
assert.equal([...components.matchAll(/^#define CONFIG_(\w+)_ENCODER 1$/gm)].length, 0);
const decoders = [...components.matchAll(/^#define CONFIG_(\w+)_DECODER 1$/gm)].map(v => v[1].toLowerCase()).sort();
verifyMpeg2DecoderSet("wide", decoders);
const passed = report.rows.filter(row => row.status === "passed" && row.container === "mp4");
assert.equal(passed.length, 2);
for (const [index, frames, size, hash, ssim] of [
  [0, 48, 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94", 0.992146],
  [1, 96, 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32", 0.985963],
]) {
  const row = passed[index];
  assert.equal(Number(row.frames), frames); assert.equal(row.outputCodec, "mpeg2video");
  assert.equal(row.outputBytes, size); assert.equal(row.outputSha256, hash); assert.equal(row.ssim, ssim);
  assert.equal(row.audioTracks, 2); assert.equal(row.metrics.wasmMemoryBytes, 50331648);
  assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
  assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  assert.ok(row.metrics.peakPendingOperations <= 1 && row.metrics.peakQueuedBytes <= 65536);
}
const ownership = report.rows.filter(row => row.kind === "actual-split-native-ownership").map(row => row.samples);
assert.equal(ownership.length, 4);
for (const rows of ownership) {
  assert.equal(rows.length, 1); const row = rows[0];
  assert.equal(row.closed, true); assert.equal(row.activePackets, 0); assert.equal(row.aggregateWasmMemoryBytes, 50331648);
  for (const name of ["queuedFrames", "queuedPackets", "additionalPixelBufferBytes", "additionalJsPacketBufferBytes"]) assert.equal(row[name], 0);
}
for (const [index, count] of [[0, 48], [1, 96]]) {
  assert.equal(ownership[index][0].frames, count); assert.equal(ownership[index][0].packets, count);
  assert.equal(ownership[index][0].completedPackets, count);
}
const writeFailure = report.rows.find(row => row.kind === "direct-write-failure");
const cancelled = report.rows.find(row => row.kind === "cancel-after-direct-output");
assert.equal(writeFailure.status, "passed"); assert.match(writeFailure.error, /destination rejected a bounded write/i);
assert.equal(cancelled.status, "passed"); assert.equal(cancelled.terminalState, "cancelled");
assert.ok(cancelled.beforeCancel.outputBytes > 32768);
for (const row of [writeFailure, cancelled]) {
  assert.deepEqual(row.partialBytes, []); assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
}
const stacks = report.rows.filter(row => row.kind === "actual-native-stack-reserve").map(row => row.samples);
assert.equal(stacks.length, 4);
for (const rows of stacks) for (const row of rows) {
  assert.equal(row.nativeStackBytes, 262144); assert.equal(row.encoderNativeStackBytes, 262144);
  assert.equal(row.decoderMemoryBytes, 33554432); assert.equal(row.encoderMemoryBytes, 16777216);
}
const restoredAssets = {};
for (const file of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const hash = sha(await read(`public/engines/remux/${file}`));
  assert.equal(sha(await read(`dist/client/engines/remux/${file}`)), hash); restoredAssets[file] = hash;
}
assert.deepEqual((await readdir(path.join(root, "work"))).filter(file => file.startsWith("mpeg2-split-runtime-") || file.startsWith("mpeg2-artwork-validation-")), []);
assert.deepEqual((await readdir(path.join(root, "dist/client/engines/remux"))).filter(file => file.startsWith("_private_split") || file.startsWith("mpeg2-split-")), []);
const files = await readdir(path.join(root, slot));
let toolBytes = 0; for (const file of files) toolBytes += (await stat(path.join(root, slot, file))).size;
const memory = report.rows.filter(row => row.samples && row.memoryScope).flatMap(row => row.samples);
const executedSources = Object.fromEntries(await Promise.all([
  "scripts/validate-mpeg2-split-pipeline.mjs", "scripts/stage-mpeg2-split-pipeline.mjs",
  "tests/browser/mpeg2-split-pipeline-candidate.spec.ts", "scripts/freeze-mpeg2-split-pipeline-small.mjs",
].map(async file => [file, sha(await read(file))])));
const proof = {
  scope: "private-real-split-production-browser-small-fidelity-adverse-not-stress-memory-speed-acceptance",
  build: { runId: 37444860342, jobId: 112207132777, headSha: "881913b57f4d04f4750e74c5efcab5f135a48fad",
    runUrl: "https://github.com/tanishqbaweja/fileconverter/actions/runs/37444860342", conclusion: "success",
    jobStartedAt: "2026-10-06T09:42:57Z", jobCompletedAt: "2026-10-06T09:52:37Z", jobSeconds: 580,
    buildStartedAt: "2026-10-06T09:43:36Z", buildCompletedAt: "2026-10-06T09:52:32Z", buildSeconds: 536,
    conversionTime: false, hostedCleanup: "success", artifactId: 11403345701, artifactDeleted: true, remainingRunArtifacts: 0,
    archiveBytes: 2214799, archiveDigest: "83a419eb8985476aeb75ef857948d366e345c924137cb516cc0625d7c76aae26" },
  raw: { file: reportFile, bytes: raw.length, sha256: sha(raw) }, manifest, executedSources,
  toolSlot: { path: slot, files: files.length, bytes: toolBytes, reusableStaticToolsOnly: true },
  actualDecoderSet: decoders,
  auditCorrection: "Initial ad-hoc exact decoder list incorrectly omitted existing explicit H263/VP3 upstream dependencies; audited against unchanged mpeg2-decoder-selection.mjs. No compilation or runtime change.",
  browser: { testsPassed: 4, suiteSeconds: 23.5, conversions: passed.map(row => ({ ...row, sourceFrameTimes: undefined, outputFrameTimes: undefined })),
    nativeOwnership: ownership.map(rows => rows[0]), nativeStackReserves: stacks.map(rows => rows[0]),
    writeFailure, cancelled, completeChromiumDiagnosticSamples: memory.length,
    unavailableDiagnosticSamples: memory.filter(row => row.privateBytes == null).length,
    stableBlankBaselineCertified: false, completeChromiumMemoryAcceptance: false,
    elapsedTimesAreNotIdenticalInputSpeedComparison: true },
  cleanup: { fixturesConvertedOutputsProfilesRuntimeRemoved: true, restoredAssets, privateGeneratedAssetsRemoved: true,
    originalRead: false, originalModified: false, noMediaOutsideRepository: true },
  publicAcceptance: false,
  next: "Changed separated-codec full unchanged test.mkv with stable blank baseline, complete Chromium tree, both actual heaps, immediate 250MiB failure, independent fidelity and three repeats if genuinely successful. Later clean sessions/scaling/speed/other full-scope requirements remain.",
};
const json = JSON.stringify(proof, null, 2) + "\n";
assert.ok(Buffer.byteLength(json) < 65536);
await writeFile(path.join(root, "evidence/mpeg2-split-pipeline-small-passed-2026-10-06.json"), json, { flag: "wx" });
console.log("Frozen actual split pipeline build and four browser passes; public/stress/speed acceptance remains unproven.");
