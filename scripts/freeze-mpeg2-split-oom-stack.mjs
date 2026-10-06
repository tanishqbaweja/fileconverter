import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readWasmFunctionNames, symbolizeWasmStack } from "./lib/wasm-stack-symbols.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportName = "outputs/reports/2026-10-06T13-26-10-061Z-private-mpeg2-split-oom-stack-diagnostic-native-100ms.json";
const bytes = await readFile(path.join(root, reportName)), report = JSON.parse(bytes), run = report.runs[0];
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, true);
assert.equal(report.publicAcceptance, false); assert.equal(report.requestedRuns, 1); assert.equal(report.runs.length, 1);
assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
assert.match(report.failure.message, /33779712 bytes \(OOM\)/);
assert.equal(report.oomStackSamples.length, 1); const abort = report.oomStackSamples[0];
assert.equal(abort.memoryBytes, 33554432); assert.ok(abort.stack.length <= 8192 && abort.what.length <= 512);
assert.equal(report.splitFinalSamples[0].frames, 243); assert.equal(report.splitFinalSamples[0].completedPackets, 243);
assert.equal(report.splitFinalSamples[0].closed, true); assert.equal(report.splitFinalSamples[0].activePackets, 0);
assert.equal(report.cleanup.errors, undefined); assert.deepEqual(report.forbiddenRequests, []);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const ids = Object.values(report.ownedPids); assert.ok(ids.every(Number.isSafeInteger));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(",")}) }).Count`], { windowsHide: true, timeout: 5000 });
assert.equal(Number(stdout.trim()), 0);
assert.equal((await stat(path.join(root, "test.mkv"))).size, report.source.bytes);
const originalHash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) originalHash.update(chunk);
assert.equal(originalHash.digest("hex"), report.source.sha256);
for (const [file, hash] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), hash);
for (const name of ["within-remux", "within-mpeg4", "within-direct"])
  for (const ext of ["mjs", "wasm"]) assert.equal(sha(await readFile(path.join(root, `dist/client/engines/remux/${name}.${ext}`))),
    sha(await readFile(path.join(root, `public/engines/remux/${name}.${ext}`))));
for (const name of ["split-abort-probe.mjs", "_private_split_decoder.mjs", "_private_split_decoder.wasm",
  "_private_split_encoder.mjs", "_private_split_encoder.wasm"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
const wasmPath = "work/mpeg2-split-pipeline-37444860342/within-mpeg2-split.wasm";
const wasm = await readFile(path.join(root, wasmPath));
assert.equal(sha(wasm), report.manifest.artifacts["within-mpeg2-split.wasm"]);
const names = readWasmFunctionNames(wasm), frames = symbolizeWasmStack(abort.stack, names);
assert.equal(frames.length, 15); assert.ok(frames.every(frame => frame.functionNameFromActualBinary));
const expectedPath = ["sbrk", "emscripten_builtin_malloc", "dlposix_memalign", "av_malloc", "av_buffer_allocz",
  "avcodec_default_get_buffer2", "ff_get_buffer", "ff_thread_get_buffer", "alloc_frame", "hevc_receive_frame",
  "ff_decode_receive_frame_internal", "decode_receive_frame_internal", "avcodec_send_packet", "mpeg2_frames", "within_remux"];
assert.deepEqual(frames.map(frame => frame.functionNameFromActualBinary), expectedPath);
assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.equal(run.nativePeaks.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), run.nativePeaks.peak.privateBytes);
const proof = { recordedAt: new Date().toISOString(), scope: "Original-source failure-only browser diagnostic; not acceptance or speed",
  report: { path: reportName, bytes: bytes.length, sha256: sha(bytes) },
  status: "failed-original-HEVC-decoded-frame-buffer-allocation", publicAcceptance: false,
  completeChromiumMemoryAcceptance: false, completedConversion: false, comparableSpeedBenchmark: false,
  actualNativeCallPathProven: true, underlyingAllocationCapacityOrFragmentationProven: false,
  source: { bytes: report.source.bytes, sha256: report.source.sha256, beforeAndAfterDriverVerified: true, independentlyVerifiedAfter: true },
  requestedRuns: 1, attemptedRuns: 1, completedRuns: 0, browserVersion: report.browserVersion,
  wasm: { path: wasmPath, bytes: wasm.length, sha256: sha(wasm), actualBinaryFunctionNames: names.size },
  nativeFramesFromActualBinary: frames, abort,
  allocation: { currentDecoderHeapBytes: abort.memoryBytes, requestedTotalHeapBytes: 33779712,
    requestedPlaneBufferBytes: null, liveFrameCount: null, largestFreeBlockBytes: null, cachedPlaneBytes: null },
  blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle, actualCompleteNativePeak: run.nativePeaks.peak,
  incrementalPrivateMiBIncomplete: run.incrementalPrivateMiB, lastState: run.state,
  nativeEncoderOwnership: report.splitFinalSamples, nativeStacks: report.nativeStackSamples,
  failure: report.failure, independentValidation: null, sourcePins: report.sourceHashes, cleanup: report.cleanup,
  independentlyVerifiedRuntimeAndPidAbsence: true, generatedAssetsRestoredAndDiagnosticRemoved: true,
  primarySource: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavcodec/get_buffer.c",
  next: "Measure actual plane-buffer request and heap free-block/live-frame state; do not retry unchanged or raise heap/quality/memory limits." };
await writeFile(path.join(root, "evidence/mpeg2-split-oom-stack-measured-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log("Frozen actual-binary native OOM call path; original, assets, runtime and PIDs checked.");
