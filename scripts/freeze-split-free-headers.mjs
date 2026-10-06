import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "outputs/reports/2026-10-06T14-08-03-667Z-private-mpeg2-split-free-headers-diagnostic-native-100ms.json";
const raw = await readFile(path.join(root, reportPath)), report = JSON.parse(raw), run = report.runs[0];
assert.equal(report.status, "failed"); assert.equal(report.publicAcceptance, false); assert.equal(report.diagnosticOnly, true);
assert.equal(report.requestedRuns, 1); assert.equal(report.runs.length, 1); assert.match(report.failure.message, /33779712 bytes \(OOM\)/);
assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
assert.equal(report.freeHeaderSamples.length, 1); const capture = report.freeHeaderSamples[0];
assert.equal(capture.available, true); assert.equal(capture.error, null); const state = capture.state;
assert.equal(state.complete, true); assert.equal(state.freeChunks, 241); assert.equal(state.totalFreeChunkBytes, 8940352);
assert.equal(state.largestFreeChunkBytes, 1597472); assert.equal(state.unclaimedMemoryAboveSegmentBytes, 1372160);
assert.equal(state.headerWordsRead, 889); assert.ok(state.headerWordsRead <= state.maximumHeaderWords);
assert.equal(state.bins.reduce((sum, bin) => sum + bin.bytes, 0) + state.topChunkBytes + state.designatedVictimBytes, state.totalFreeChunkBytes);
assert.equal(state.bins.reduce((sum, bin) => sum + bin.chunks, 0) + 2, state.freeChunks);
assert.equal(state.freeChunkSizeLog2Histogram.reduce((sum, count) => sum + count, 0), state.freeChunks);
for (const field of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated"]) assert.equal(state[field], false);
assert.equal(state.liveFrameCount, null);
const staticPath = "evidence/split-dlmalloc-static-layout-2026-10-06.json", staticRaw = await readFile(path.join(root, staticPath)), layout = JSON.parse(staticRaw);
assert.equal(layout.actualBinary.sha256, report.manifest.artifacts["within-mpeg2-split.wasm"]);
const staticReport = JSON.parse(await readFile(path.join(root, layout.report.path)));
const compiled = staticReport.inspection.selectedFunctions.dlposix_memalign.text;
const compiledPadding = /i32\.const 11\s+i32\.add\s+i32\.const -8\s+i32\.and/;
assert.match(compiled, compiledPadding); assert.match(compiled, /local\.tee \$l5\s+i32\.const 28\s+i32\.add\s+local\.set \$p1/);
assert.match(compiled, /local\.get \$p1\s+call \$emscripten_builtin_malloc/);
const localsPath = "evidence/mpeg2-split-oom-locals-measured-2026-10-06.json", localsRaw = await readFile(path.join(root, localsPath)), locals = JSON.parse(localsRaw);
assert.equal(locals.actualBinary.sha256, layout.actualBinary.sha256);
const planeBytes = locals.requestedPlaneBufferBytes, plainChunkBytes = Math.floor((planeBytes + 11) / 8) * 8;
const alignedTemporaryMallocRequestBytes = plainChunkBytes + 28, alignedTemporaryChunkBytes = Math.floor((alignedTemporaryMallocRequestBytes + 11) / 8) * 8;
assert.equal(alignedTemporaryMallocRequestBytes, locals.nativeFrames.find(frame => frame.functionName === "dlposix_memalign").locals.find(local => local.name === "$var1").value);
assert.equal(alignedTemporaryChunkBytes - state.largestFreeChunkBytes, 32);
assert.ok(state.totalFreeChunkBytes > alignedTemporaryChunkBytes);
const original = path.join(root, "test.mkv"); assert.equal((await stat(original)).size, report.source.bytes);
const originalHash = createHash("sha256"); for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) originalHash.update(chunk);
assert.equal(originalHash.digest("hex"), report.source.sha256);
for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), digest);
for (const name of ["within-remux", "within-mpeg4", "within-direct"])
  for (const ext of ["mjs", "wasm"]) assert.equal(sha(await readFile(path.join(root, `dist/client/engines/remux/${name}.${ext}`))), sha(await readFile(path.join(root, `public/engines/remux/${name}.${ext}`))));
for (const name of ["split-free-header-probe.mjs", "dlmalloc-free-header-inspection.mjs", "split-abort-probe.mjs",
  "_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"])
  await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const ids = Object.values(report.ownedPids); assert.ok(ids.every(Number.isSafeInteger));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(",")}) }).Count`], { windowsHide: true, timeout: 5000 }); assert.equal(Number(stdout.trim()), 0);
assert.deepEqual(report.forbiddenRequests, []); assert.equal(report.cleanup.errors, undefined);
assert.ok(Object.values(report.cleanup).filter(value => typeof value === "boolean").every(Boolean));
assert.equal(report.splitFinalSamples[0].frames, 243); assert.equal(report.splitFinalSamples[0].completedPackets, 243);
assert.equal(report.splitFinalSamples[0].closed, true); assert.equal(report.splitFinalSamples[0].activePackets, 0);
assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.equal(run.nativePeaks.peak.processes.reduce((sum, process) => sum + process.privateBytes, 0), run.nativePeaks.peak.privateBytes);
const proof = { recordedAt: new Date().toISOString(), status: "original-failure-free-space-and-alignment-padding-measured",
  scope: "One changed failure-only read-only browser allocator diagnostic on exact unchanged core. Not success/speed/memory acceptance.",
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, completedConversion: false, comparableSpeedBenchmark: false,
  report: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  staticLayout: { path: staticPath, sha256: sha(staticRaw) }, priorActualSizeLocals: { path: localsPath, sha256: sha(localsRaw) },
  original: { bytes: report.source.bytes, sha256: report.source.sha256, driverBeforeAndAfterVerified: true, independentlyVerifiedAfter: true },
  actualNativeCoreSha256: layout.actualBinary.sha256, allocator: state,
  alignmentAnalysis: { requestedPlaneBytes: planeBytes, plainChunkBytes, alignedTemporaryMallocRequestBytes, alignedTemporaryChunkBytes,
    largestExistingFreeChunkBytes: state.largestFreeChunkBytes, temporaryChunkShortfallBytes: 32,
    aggregateFreeBytesExceedTemporaryChunk: true, dynamicFragmentationAtAbortProven: true,
    compiledFormulaCorroboratedByPriorActualNativeLocal: true, successfulAlignmentPreservingReuseProven: false,
    inference: "There is sufficient aggregate free space, but the extra aligned-allocation reservation exceeds every existing free chunk; fixed-heap MORECORE expansion also fails. This is not proof any arbitrary malloc pointer satisfies FFmpeg alignment." },
  liveFrameOwnershipMeasured: false, liveFrameCount: null, cachedPlaneBytes: null,
  nativeEncoderOwnership: report.splitFinalSamples, lastMetrics: run.state.metrics,
  browserVersion: report.browserVersion, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  completeChromiumPeak: run.nativePeaks.peak, incrementalPrivateMiBIncomplete: run.incrementalPrivateMiB,
  requestedRuns: 1, completedRuns: 0, failure: report.failure, independentValidation: null,
  sourcePins: report.sourceHashes, cleanup: report.cleanup, independentlyVerifiedRuntimeAndPidAbsence: true,
  generatedAssetsRestoredAndDiagnosticRemoved: true,
  primaryAllocatorSource: layout.primaryAllocatorSource,
  next: "Test an alignment-preserving reuse strategy in a separate pinned private candidate; never return misaligned pointers, release live references, change codec quality or raise the fixed heap/memory gate." };
await writeFile(path.join(root, "evidence/split-free-headers-measured-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log("Frozen 8940352-byte aggregate free inventory, 32-byte aligned-reservation shortfall; original, assets, runtime/PIDs independently verified.");
