// Terminal evidence only: never attaches to or restarts the original driver.
// Preserve the exact measured peak including trace finalization and all owned
// Chromium processes. Native inspection/hashes below are independent validators.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { joinNativeBurstDumps } from "./lib/native-burst-dump-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), MiB = 1048576;
const file = process.argv[2];
assert.match(file ?? "", /^outputs\/reports\/[0-9TZ-]+-private-mpeg2-burst-attribution-native-100ms\.json$/);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.ok((await stat(path.join(root, file))).size <= 32 * MiB);
const raw = await readFile(path.join(root, file)), report = JSON.parse(raw);
assert.equal(report.status, "failed"); assert.equal(report.diagnosticOnly, true); assert.equal(report.publicAcceptance, false);
assert.equal(report.limitMiB, 250); assert.equal(report.requestedRuns, 1); assert.ok(report.runs.length <= 1);
assert.equal(report.ownedPids.chrome, 31336, "Only the actually launched changed diagnostic is admitted");
assert.equal(report.source.bytes, 2958573265);
assert.equal(report.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped"])
  assert.equal(report.cleanup[key], true, key);
// The driver's immediate CIM root-absence check failed. Preserve that actual
// false flag/error; separately prove current identity absence below, never
// overwrite history or kill a PID which might already have been reused.
assert.equal(typeof report.cleanup.sampledChromeRootStopped, "boolean");
assert.deepEqual(report.forbiddenRequests, []);
const runtimeRelative = path.relative(path.join(root, "work"), report.runtimeDirectory);
assert.ok(runtimeRelative && !runtimeRelative.startsWith("..") && !path.isAbsolute(runtimeRelative));
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
await assert.rejects(access(path.join(root, "work/mpeg2-burst-driver-g3zXxb")), { code: "ENOENT" });
const pins = {};
for (const [file, digest] of Object.entries(report.sourceHashes)) {
  assert.equal(sha(await readFile(path.join(root, file))), digest, file); pins[file] = digest;
}
for (const file of ["scripts/freeze-mpeg2-burst-attribution.mjs", "scripts/lib/native-burst-dump-join.mjs"])
  pins[file] = sha(await readFile(path.join(root, file)));
const identities = report.nativeMemory.identities;
assert.ok(identities.length > 0 && identities.length <= 512);
const ownedPids = [...new Set([...identities.map(p => p.pid), ...Object.values(report.ownedPids), 34664])];
for (const pid of ownedPids) assert.ok(Number.isSafeInteger(pid) && pid > 0);
const query = ownedPids.map(pid => `ProcessId = ${pid}`).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
const matchingSurvivors = current.filter(p => identities.some(old => old.pid === p.pid &&
  Math.abs(Date.parse(old.createdAt) - Date.parse(p.createdAt)) < 1));
assert.deepEqual(matchingSurvivors, [], "All sampled native PID/birth identities must actually be absent");
for (const pid of Object.values(report.ownedPids)) assert.ok(!current.some(p => p.pid === pid), "Owned helper/root must be absent");
assert.ok(!current.some(p => p.pid === 34664 && Math.abs(Date.parse(p.createdAt) - Date.parse("2026-10-06T23:12:39.6283990Z")) < 1));
const restoredAssetPins = {};
for (const name of ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm", "within-direct.mjs", "within-direct.wasm"]) {
  const digest = sha(await readFile(path.join(root, "public/engines/remux", name)));
  assert.equal(sha(await readFile(path.join(root, "dist/client/engines/remux", name))), digest);
  restoredAssetPins[name] = digest;
}
const privateAssetsAbsent = ["_private_split_decoder.mjs", "_private_split_decoder.wasm", "_private_split_encoder.mjs", "_private_split_encoder.wasm",
  "mpeg2-split-session.mjs", "mpeg2-split-frame-bridge.mjs", "mpeg2-split-frame-layout.mjs", "mpeg2-split-frame-properties.mjs", "mpeg2-split-packet-bridge.mjs"];
for (const name of privateAssetsAbsent) await assert.rejects(access(path.join(root, "dist/client/engines/remux", name)), { code: "ENOENT" });
const source = path.join(root, "test.mkv"), sourceHash = createHash("sha256");
assert.equal((await stat(source)).size, report.source.bytes);
for await (const bytes of createReadStream(source, { highWaterMark: MiB })) sourceHash.update(bytes);
assert.equal(sourceHash.digest("hex"), report.source.sha256);
const decode = row => row ? { sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: row[3], rssBytes: row[4],
  processes: row[7].map(([index, privateBytes, rssBytes]) => ({ ...identities[index], privateBytes, rssBytes })) } : null;
const phaseRows = report.nativeMemory.phases.filter(p => ["pre-conversion-1", "conversion-1"].includes(p.phase));
const peakRow = phaseRows.map(p => p.peak).filter(Boolean).sort((a, b) => b[3] - a[3])[0] ?? null;
const finalPeak = decode(peakRow), run = report.runs[0] ?? null;
if (finalPeak) assert.equal(finalPeak.privateBytes, finalPeak.processes.reduce((n, p) => n + p.privateBytes, 0));
const attribution = report.rendererAttributionResult, bursts = report.nativeBurstResult;
const joinedDumps = attribution && bursts ? joinNativeBurstDumps(bursts, attribution) : null;
const evidence = { recordedAt: new Date().toISOString(), status: "terminal-private-original-burst-diagnostic-not-acceptance",
  scope: report.scope, rawReport: { path: file, bytes: raw.length, sha256: sha(raw) },
  browserVersion: report.browserVersion,
  source: { path: "test.mkv", bytes: report.source.bytes, sha256: report.source.sha256 },
  sourceIndependentlyPostHashed: true, formula: report.formula, limitMiB: report.limitMiB,
  startupSettlement: report.startupSettlement, blankBaseline: report.blankBaseline, loadedIdle: report.loadedIdle,
  gateTriggerPeak: run?.nativePeaks?.peak ?? null, gateTriggerIncrementalPrivateMiB: run?.incrementalPrivateMiB ?? null,
  finalPreConversionAndConversionNativePeak: finalPeak,
  finalNativeIncrementalPrivateMiB: finalPeak && report.blankBaseline ? (finalPeak.privateBytes - report.blankBaseline.privateBytes) / MiB : null,
  nativeObserverError: report.nativeMemory.error, nativePhaseCoverage: phaseRows.map(p => ({ phase: p.phase,
    validSamples: p.validSamples, unavailableSamples: p.unavailableSamples })),
  candidateDecoderSha256: report.manifest.artifacts["within-mpeg2-split.wasm"],
  aggregateWasmMemoryBytes: report.manifest.aggregateWasmMemoryBytes,
  nativeBursts: bursts, joinedDumps, skippedBurstDumps: report.skippedBurstDumps,
  trace: attribution ? { status: attribution.status, limits: attribution.limits, trace: attribution.trace,
    dumps: attribution.dumps, allocatorSummary: attribution.allocatorSummary,
    realmRows: attribution.realmRows.length, realmRowsEvicted: attribution.realmRowsEvicted,
    samplingError: attribution.samplingError, summedAllocatorTotal: attribution.summedAllocatorTotal } : null,
  lastPreCancellationMetrics: run?.state?.metrics ?? null,
  inheritedPhaseCaveat: "Private adapter forces fresh MPEG2 encoding through the public remux selector. Inherited Lossless remux text is not the private codec operation or a public profile.",
  splitFinalSamples: report.splitFinalSamples, nativeStackSamples: report.nativeStackSamples,
  failure: report.failure, cleanup: report.cleanup, ownedPids: report.ownedPids,
  laterIndependentCleanup: { checkedAt: new Date().toISOString(), allSampledNativeIdentitiesAbsent: true,
    ownedDriverAndHelperRootsAbsent: true, ownedRuntimeDirectoriesAbsent: true,
    protectedSourceMatchesFullPostHash: true, publishedAssetsRestored: true, privateAdditionsAbsent: true,
    historicalRootAbsenceFailurePreserved: report.cleanup.sampledChromeRootStopped === false },
  sampledProcessIdentitiesIndependentlyAbsent: identities.length, matchingSurvivors,
  restoredAssetPins, privateAssetsAbsent, runtimeDirectory: report.runtimeDirectory,
  sourcePins: pins, completeOriginalConversion: false, completeChromiumMemoryAcceptance: false,
  publicAcceptance: false, conversionSpeedAcceptance: false, allocationObjectOrCallSite: null,
  originalUninstrumentedFailureCause: null, processesExcluded: 0, qualityChanged: false,
  caveat: "Instrumented private run is not memory/speed/fidelity acceptance. Final native peak includes trace finalization. Dump PID/name and allocator provider values identify neither an object/callsite nor the cause of the earlier uninstrumented peak. No full-original audio acceptance.",
  next: "Use the actual GUID/process/latency/provider evidence to choose a justified changed allocation diagnostic or optimization; never repeat an unchanged full conversion, enlarge the baseline, omit a process or relax quality/limits." };
const json = JSON.stringify(evidence, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) <= 262144);
await writeFile(path.join(root, "evidence/mpeg2-burst-attribution-2026-10-07.json"), json, { flag: "wx" });
console.log(JSON.stringify({ evidence: "evidence/mpeg2-burst-attribution-2026-10-07.json", failure: report.failure?.message,
  finalNativeIncrementalPrivateMiB: evidence.finalNativeIncrementalPrivateMiB, bursts: bursts?.events.length,
  joinedDumps: joinedDumps?.length, cleanup: report.cleanup, sourceIndependentlyPostHashed: true }));
