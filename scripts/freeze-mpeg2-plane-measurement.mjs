// Reduce actual retained reports; no media conversion or automatic retry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { summarizeFramePlaneTrace } from "./lib/mpeg2-frame-plane-trace.mjs";

const root = new URL("../", import.meta.url);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = {
  small: ["output/playwright/2026-10-06T00-12-55.876Z-mpeg2-artwork-metadata-37392190577-artwork.json",
    340475, "637fea9518fdf089adefde2eef3b820e6f2c1b0f4685e42fa117274f8048a55a"],
  full: ["outputs/reports/2026-10-06T00-13-25-563Z-private-mpeg2-protected-direct-native-100ms.json",
    314682, "0b15547dd464907c36bb11624f7703d9bb23fbca3c44836bad9f20939437c050"],
};
const rawReports = {}, reports = {};
for (const [name, [file, bytes, hash]] of Object.entries(expected)) {
  const data = await readFile(new URL(file, root)); assert.equal(data.length, bytes); assert.equal(sha(data), hash);
  reports[name] = JSON.parse(data); rawReports[name] = { file, bytes, sha256: hash };
}
const { small, full } = reports, run = full.runs[0];
assert.deepEqual(small.manifest, full.manifest);
assert.equal(full.status, "failed"); assert.equal(full.diagnosticOnly, true);
assert.equal(full.requestedRuns, 1); assert.equal(full.runs.length, 1);
assert.equal(full.manifest.frameAllocationDiagnostic, true);
assert.equal(full.manifest.allocatorDiagnostic, false); assert.equal(full.manifest.nativeAllocator, "dlmalloc");
assert.equal(full.manifest.decoderSet, "hevc-mpeg4");
assert.equal(full.manifest.frameAllocationDiagnosticSourceSha256, "71fb08761ce7c72554ec48ec2a64dfa1973d558c21ec1731f82d62939a7f46d7");
assert.equal(Object.keys(full.manifest.sources).length, 21); assert.equal(Object.keys(full.manifest.artifacts).length, 3);
assert.deepEqual(full.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(run.state.metrics.inputBytes, 222785); assert.equal(run.state.metrics.outputBytes, 0);
assert.match(run.state.error, /size 33787904 bytes \(OOM\)/); assert.equal(run.independentValidation, null);
assert.deepEqual(full.forbiddenRequests, []); assert.ok(Object.values(full.cleanup).every((value) => value === true));
const planeTrace = summarizeFramePlaneTrace(full.allocatorSamples,
  { error: run.state.error, eventsEvicted: full.allocatorSamplesEvicted });
assert.equal(planeTrace.events, 83); assert.equal(planeTrace.completedPlaneRequests, 41);
assert.equal(planeTrace.capReached, false); assert.equal(planeTrace.eventsEvicted, 0);
assert.deepEqual(planeTrace.failedAllocation, { kind: "frame-plane-allocation", sequence: 83, phase: "before",
  codecId: 2, encoder: true, contextWidth: 1920, contextHeight: 804, codedWidth: 1920, codedHeight: 804,
  width: 1952, height: 836, pixelFormat: 0, plane: 2, requestedBytes: 421655, linesize: 976,
  frameBufferBytes: 2108206, succeeded: null, scope: "scalar-request-not-heap-free-space-not-acceptance" });
const cases = small.rows.filter((row) => row.outputCodec);
assert.deepEqual(cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.outputSha256, row.ssim]), [
  ["mpeg4", "48", 321692, "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94", 0.992146],
  ["hevc", "96", 652521, "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32", 0.985963],
]);
for (const row of cases) {
  assert.equal(row.status, "passed"); assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
  for (const field of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(row.metrics[field], 65536);
  assert.equal(row.metrics.peakPendingOperations, 1);
  assert.equal(row.sourceFrameTimes.length, row.outputFrameTimes.length);
  row.outputFrameTimes.forEach((value, index) => assert.ok(Math.abs(value - row.sourceFrameTimes[index]) <= 0.001));
}
const adverse = small.rows.filter((row) => ["direct-write-failure", "cancel-after-direct-output"].includes(row.kind));
assert.equal(adverse.length, 2);
for (const row of adverse) {
  assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
}
assert.equal(adverse[1].beforeCancel.outputBytes, 349012);
assert.equal(adverse[1].metrics.outputBytes, 599048); assert.equal(adverse[1].terminalState, "cancelled");
const decodedAudio = small.rows.filter((row) => row.kind === "independent-decoded-audio");
assert.equal(decodedAudio.length, 2);
for (const row of decodedAudio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
const peak = run.nativePeaks.peak;
assert.equal(peak.privateBytes, peak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
assert.equal(run.incrementalPrivateMiB,
  (Math.max(peak.privateBytes, run.cimPeakPrivateBytes) - full.blankBaseline.privateBytes) / 1024 ** 2);
assert.equal(run.incrementalPrivateMiB, 186.48828125);
const sources = {};
for (const file of ["scripts/freeze-mpeg2-plane-measurement.mjs", "scripts/lib/mpeg2-frame-plane-trace.mjs"])
  sources[file] = sha(await readFile(new URL(file, root)));
const proof = {
  status: "actual-encoder-third-plane-heap-abort-not-conversion-acceptance",
  diagnosticOnly: true, publicAcceptance: false, primaryMemoryAcceptance: false, speedGainClaim: null,
  rawReports, sources, manifest: full.manifest, harnessSources: full.sourceHashes,
  run: { databaseId: 37392190577, jobId: 112039630658,
    headSha: "a5bdf2fc70a8e826121fe64369106ab2313e1d43", conclusion: "success",
    buildSeconds: 268, jobSeconds: 316, scope: "native build, not conversion speed" },
  actualWasmMemoryLimits: full.actualWasmMemoryLimits,
  planeTrace, actualPlaneSamples: full.allocatorSamples,
  limits: "Scalar plane/context attribution applies to THIS instrumented run, not automatic proof of the exact uninstrumented failure, heap fragmentation, idle-cache retention or recoverable bytes. Ever-allocated planes are not simultaneously live planes. No smaller source, heap raise, layout change, live-reference drop or quality relaxation.",
  small: { passedCases: 4, suiteSeconds: 18.3, cases, adverse, decodedAudio,
    actualStackReserves: small.rows.filter((row) => row.kind === "actual-native-stack-reserve"),
    outputsByteIdenticalToNormalCandidate: true, completeProcessMemoryAcceptance: false, sameInputSpeedAB: false },
  protected: { source: { bytes: full.source.bytes, sha256: full.source.sha256, width: 1920, height: 804, inputChanged: false },
    browserVersion: full.browserVersion, requestedRuns: 1, attemptedRuns: 1, completedConversions: 0,
    failedRequestedHeapEndBytes: 33787904, metrics: run.state.metrics, error: run.state.error,
    independentValidation: null, unchangedRetryUseful: false },
  memory: { formula: full.formula, limitMiB: 250, blankBaseline: full.blankBaseline, loadedIdle: full.loadedIdle,
    nativePeak: peak, cimPeakPrivateBytes: run.cimPeakPrivateBytes, incrementalPrivateMiB: run.incrementalPrivateMiB,
    validSamples: run.nativePeaks.validSamples, unavailableSamples: run.nativePeaks.unavailableSamples,
    instrumentedIncompleteConversion: true, acceptance: false, unknownProcessTypesRetained: true },
  cleanup: { ...full.cleanup, ownedPids: full.ownedPids, observedIdentities: full.nativeMemory.identities,
    runtimeDirectory: full.runtimeDirectory, independentlyVerifiedFullObservedAndOwnedIdentitiesAbsent: 15,
    independentlyVerifiedSmallObservedPidsAbsent: 20, independentlyVerifiedSixAssetsRestored: true,
    independentlyVerifiedAdaptersAndRuntimeAbsent: true, independentlyVerifiedSmallFixturesAndRuntimeAbsent: true,
    independentlyVerifiedOriginalSha256: full.source.sha256,
    numericPidReuse: { pid: 28584, originalName: "chrome.exe", originalCreatedAt: "2026-10-06T00:13:30.9359346Z",
      laterName: "updater.exe", laterCreatedAt: "2026-10-06T00:13:55.746427Z", originalParentPid: 27192,
      laterParentPid: 28540, originalIdentityGone: true, unrelatedProcessKilled: false },
    deletedHostedArtifactIds: [11381662331, 11381822017], hostedArtifactsRemaining: 0,
    sourceBundleDownloaded: false, retainedLocalStaticToolFiles: 7, downloadTemporaryZipAbsent: true },
  next: "Encoder plane2's421655-byte request is now attributable in the diagnostic. Audit genuinely live versus inactive HEVC auxiliary objects and bounded decoder/encoder decomposition before another optimization; plane totals or the requested heap end do not prove recoverable memory. Preserve source/settings/quality/live references/alignment/fixed memory/all-process gate. No unchanged retry or diagnostic speed/acceptance/public promotion. Full goal remains incomplete.",
};
process.stdout.write(`${JSON.stringify(proof)}\n`);
