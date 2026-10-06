import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportName = "outputs/reports/2026-10-06T13-16-48-807Z-private-mpeg2-split-single-navigation-native-100ms.json";
const bytes = await readFile(path.join(root, reportName)), report = JSON.parse(bytes), run = report.runs[0];
assert.equal(report.status, "failed"); assert.equal(report.publicAcceptance, false);
assert.equal(report.requestedRuns, 3); assert.equal(report.runs.length, 1);
assert.match(report.failure.message, /33779712 bytes \(OOM\)/);
assert.equal(run.state.jobState, "error"); assert.equal(run.independentValidation, null);
assert.equal(run.state.metrics.wasmMemoryBytes, 50331648);
assert.equal(report.splitFinalSamples.length, 1); assert.equal(report.splitFinalSamples[0].frames, 243);
assert.equal(report.splitFinalSamples[0].packets, 243); assert.equal(report.splitFinalSamples[0].completedPackets, 243);
assert.equal(report.splitFinalSamples[0].activePackets, 0); assert.equal(report.splitFinalSamples[0].closed, true);
assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - report.blankBaseline.privateBytes) / 1048576);
assert.equal(run.nativePeaks.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), run.nativePeaks.peak.privateBytes);
assert.equal(report.cleanup.errors, undefined); assert.deepEqual(report.forbiddenRequests, []);
for (const field of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
  assert.equal(report.cleanup[field], true);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
const ids = Object.values(report.ownedPids); assert.ok(ids.every(Number.isSafeInteger));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in @(${ids.join(",")}) }).Count`], { windowsHide: true, timeout: 5000 });
assert.equal(Number(stdout.trim()), 0);
assert.equal((await stat(path.join(root, "test.mkv"))).size, report.source.bytes);
const originalHash = createHash("sha256");
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) originalHash.update(chunk);
assert.equal(originalHash.digest("hex"), report.source.sha256);
for (const [file, digest] of Object.entries(report.sourceHashes)) assert.equal(sha(await readFile(path.join(root, file))), digest);
for (const name of ["within-remux", "within-mpeg4", "within-direct"])
  for (const ext of ["mjs", "wasm"]) assert.equal(sha(await readFile(path.join(root, `dist/client/engines/remux/${name}.${ext}`))),
    sha(await readFile(path.join(root, `public/engines/remux/${name}.${ext}`))));
const proof = { recordedAt: new Date().toISOString(), scope: report.scope, status: "failed-original-decoder-heap",
  report: { path: reportName, bytes: bytes.length, sha256: sha(bytes) },
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, completedConversion: false,
  comparableSpeedBenchmark: false, comparableMemorySaving: false, exactFailedNativeAllocationProven: false,
  original: { bytes: report.source.bytes, sha256: report.source.sha256, beforeAndAfterDriverVerified: true, independentlyVerifiedAfter: true },
  requestedRuns: 3, attemptedRuns: 1, completedRuns: 0, browserVersion: report.browserVersion,
  blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  actualCompleteNativePeak: run.nativePeaks.peak, incrementalPrivateMiBIncomplete: run.incrementalPrivateMiB,
  lastState: run.state, nativeEncoderSessionOwnership: report.splitFinalSamples, nativeStacks: report.nativeStackSamples,
  independentValidation: null, failure: report.failure, sourcePins: report.sourceHashes,
  cleanup: report.cleanup, independentRuntimeAndPidAbsence: true, generatedAssetsMatchPublished: true,
  conclusions: ["The unchanged split core reached243 actual frame/packet handoffs, not just initialization.",
    "Mux-accepted packets and progress bytes do not prove an independently validated complete file.",
    "The32MiB decoder/mux heap aborted at requested33779712bytes; underlying allocating function/free space/fragmentation remain unproven.",
    "205.8515625MiB is an incomplete full-tree measurement, not certification or a like-for-like saving; clean-session baselines differ.",
    "No unchanged retry. Next attribute decoder heap/static footprint and actual failing allocation before selecting a changed specialist build."] };
await writeFile(path.join(root, "evidence/mpeg2-split-single-navigation-original-failed-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log("Frozen failed original split proof; source/PIDs/runtime/assets independently checked.");
