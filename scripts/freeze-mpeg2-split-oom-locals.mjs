import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "outputs/reports/2026-10-06T13-50-31-433Z-private-mpeg2-split-oom-locals-diagnostic-native-100ms.json";
const raw = await readFile(path.join(root, reportPath)), report = JSON.parse(raw), run = report.runs[0];
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, true); assert.equal(report.publicAcceptance, false);
assert.equal(report.requestedRuns, 1); assert.equal(report.runs.length, 1);
assert.match(report.failure.message, /33779712 bytes \(OOM\)/);
assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
const debuggerReport = report.debuggerLocals;
assert.equal(debuggerReport.pauses, 1); assert.equal(debuggerReport.wasmScriptsObserved, 2);
assert.equal(debuggerReport.captures.length, 1); assert.deepEqual(debuggerReport.errors, []);
const capture = debuggerReport.captures[0];
assert.equal(capture.sourceEvaluation, false); assert.equal(capture.javascriptFramesInspected, 0);
assert.equal(capture.wasmScalarWrappersOnly, true); assert.ok(capture.propertyOperations <= 64);
const nativeFrames = capture.frames.map(frame => ({ functionName: frame.functionName.replace(/^\$/, ""),
  codeOffset: frame.location.columnNumber, locals: frame.scopes.flatMap(scope => scope.properties).map(property => {
    assert.equal(property.subtype, "wasmvalue");
    const value = property.children.find(child => child.name === "value");
    return { name: property.name, wasmType: property.description, value: value.value,
      unavailableDescription: value.value == null ? value.description : null };
  }) }));
assert.deepEqual(nativeFrames.map(frame => frame.functionName), ["sbrk", "emscripten_builtin_malloc", "dlposix_memalign", "av_malloc", "av_buffer_allocz"]);
const wasmPath = "work/mpeg2-split-pipeline-37444860342/within-mpeg2-split.wasm", wasm = await readFile(path.join(root, wasmPath));
assert.equal(sha(wasm), report.manifest.artifacts["within-mpeg2-split.wasm"]);
const metadata = readWasmFunctionMetadata(wasm, new Set(nativeFrames.map(frame => frame.functionName)));
for (const frame of nativeFrames) {
  const actual = metadata.find(entry => entry.name === frame.functionName);
  assert.ok(actual.bodyStart <= frame.codeOffset && frame.codeOffset < actual.bodyEnd, "Pause offset must lie within named actual binary function");
}
const scalar = (functionName, name) => nativeFrames.find(frame => frame.functionName === functionName).locals.find(local => local.name === name).value;
for (const name of ["av_malloc", "av_buffer_allocz"]) {
  assert.deepEqual(metadata.find(entry => entry.name === name).params, ["i32"]);
  assert.deepEqual(metadata.find(entry => entry.name === name).results, ["i32"]);
  assert.equal(scalar(name, "$var0"), 1597463);
}
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, report.source.bytes);
const originalHash = createHash("sha256");
for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) originalHash.update(chunk);
assert.equal(originalHash.digest("hex"), report.source.sha256);
for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), digest);
for (const name of ["within-remux", "within-mpeg4", "within-direct"])
  for (const ext of ["mjs", "wasm"]) assert.equal(sha(await readFile(path.join(root, `dist/client/engines/remux/${name}.${ext}`))),
    sha(await readFile(path.join(root, `public/engines/remux/${name}.${ext}`))));
for (const name of ["split-abort-pause.mjs", "split-abort-probe.mjs", "_private_split_decoder.mjs", "_private_split_decoder.wasm",
  "_private_split_encoder.mjs", "_private_split_encoder.wasm", "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs",
  "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const ids = Object.values(report.ownedPids); assert.ok(ids.every(Number.isSafeInteger));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(",")}) }).Count`], { windowsHide: true, timeout: 5000 });
assert.equal(Number(stdout.trim()), 0);
assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.cleanup.errors, undefined);
assert.ok(Object.values(report.cleanup).filter(value => typeof value === "boolean").every(Boolean));
assert.equal(report.splitFinalSamples[0].frames, 243); assert.equal(report.splitFinalSamples[0].completedPackets, 243);
assert.equal(report.splitFinalSamples[0].closed, true); assert.equal(report.splitFinalSamples[0].activePackets, 0);
assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.equal(run.nativePeaks.peak.processes.reduce((total, process) => total + process.privateBytes, 0), run.nativePeaks.peak.privateBytes);
const prerequisitePath = "output/playwright/2026-10-06T13-48-03-253Z-wasm-debugger-locals.json";
const prerequisiteBytes = await readFile(path.join(root, prerequisitePath)), prerequisite = JSON.parse(prerequisiteBytes);
assert.equal(prerequisite.status, "passed-prerequisite"); assert.equal(prerequisite.dedicatedWorkerTransportVerified, true);
assert.equal(prerequisite.evaluation.hostValue, 123456); assert.equal(prerequisite.capture.frames.length, 1);
assert.equal(prerequisite.originalFileUsed, false); assert.deepEqual(prerequisite.cleanupErrors, []);
for (const [file, digest] of Object.entries(prerequisite.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), digest);
const proof = { recordedAt: new Date().toISOString(), status: "measured-original-HEVC-plane-request-still-fails",
  scope: "One original-source failure-point browser debugger diagnostic. Not conversion success, speed, or 250MiB acceptance.",
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, completedConversion: false, comparableSpeedBenchmark: false,
  rawReport: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  prerequisite: { path: prerequisitePath, bytes: prerequisiteBytes.length, sha256: sha(prerequisiteBytes),
    knownWasmArgument: 123456, capturedNativeFrames: 1, propertyOperations: prerequisite.capture.propertyOperations,
    dedicatedWorkerTransportVerified: true, originalFileUsed: false, conversionsPerformed: 0, cleanup: prerequisite.cleanup,
    sourcePins: prerequisite.sourcePins },
  original: { bytes: report.source.bytes, sha256: report.source.sha256, driverBeforeAndAfterVerified: true, independentlyVerifiedAfter: true },
  actualBinary: { path: wasmPath, bytes: wasm.length, sha256: sha(wasm), selectedFunctionMetadata: metadata },
  requestedPlaneBufferBytes: 1597463, requestCorroboration: "Both av_buffer_allocz and av_malloc Wasm local0; actual binary single i32 signatures and pause offsets verified, pinned FFmpeg size argument source checked.",
  currentDecoderMemoryBytes: 33554432, requestedTotalHeapBytes: 33779712,
  allocationSucceeded: false, liveFrameCount: null, largestFreeBlockBytes: null, cachedPlaneBytes: null,
  capacityOrFragmentationCauseProven: false, optimizedNonParameterLocalsSemantics: "uninterpreted; compiler may reuse them",
  nativeFrames, propertyOperations: capture.propertyOperations, javascriptFramesInspected: 0, sourceEvaluation: false,
  requestedRuns: 1, completedRuns: 0, browserVersion: report.browserVersion,
  blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle, completeChromiumPeak: run.nativePeaks.peak,
  incrementalPrivateMiBIncomplete: run.incrementalPrivateMiB,
  lastMetrics: run.state.metrics, nativeEncoderOwnership: report.splitFinalSamples, nativeStacks: report.nativeStackSamples,
  failure: report.failure, independentValidation: null, sourcePins: report.sourceHashes,
  metadataReaderSha256: sha(await readFile(path.join(root, "scripts/lib/wasm-function-metadata.mjs"))),
  cleanup: report.cleanup, independentlyVerifiedRuntimeAndPidAbsence: true, generatedAssetsRestoredAndDiagnosticRemoved: true,
  primarySources: ["https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/buffer.c",
    "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/libavutil/mem.c"],
  next: "Measure actual DLmalloc free blocks and live HEVC frames at this failure, using bounded read-only capture or a narrowly scoped diagnostic build. Never free live references or raise heap/quality/memory limits." };
await writeFile(path.join(root, "evidence/mpeg2-split-oom-locals-measured-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log("Frozen 1597463-byte actual failure-point plane request; original, fixed cores, restored assets, runtime/PID absence independently verified.");
