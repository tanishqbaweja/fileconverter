// Independent terminal validation; compress only the exact verified report.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { JS_ALLOCATION_LIMITS, JS_ALLOCATION_SETTINGS, summarizeJsAllocation } from "./lib/bounded-js-allocation.mjs";
import { makeUiJsAllocationControl } from "./lib/ui-js-allocation-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3);
const receiptPath = process.argv[2].replaceAll("\\", "/");
assert.match(receiptPath, /^evidence\/2026-10-08T[\dTZ-]+-ui-js-allocation-receipt\.json$/);
const readBounded = async (file, cap) => {
  const full = path.join(root, file), identity = await lstat(full, { bigint: true });
  assert.ok(identity.isFile() && !identity.isSymbolicLink() && identity.size <= BigInt(cap));
  assert.equal(await realpath(full), full, "Evidence must resolve to the exact repository path");
  const bytes = await readFile(full); assert.equal(bytes.length, Number(identity.size));
  return { bytes, identity, full };
};
const receiptInput = await readBounded(receiptPath, 65536), receipt = JSON.parse(receiptInput.bytes);
assert.equal(receipt.status, "completed-diagnostic"); assert.equal(receipt.sourcePinsUnchanged, true);
assert.equal(receipt.wrapperRuntimeRemoved, true); assert.equal(receipt.browserRuns, 1);
for (const [file, hash] of Object.entries(receipt.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const generated = makeUiJsAllocationControl(await readFile(path.join(root, "scripts/diagnose-ui-native-allocation.mjs"), "utf8"), root);
assert.deepEqual(receipt.generatedControl, { bytes: Buffer.byteLength(generated), sha256: sha(generated) });
assert.match(receipt.report.path, /^output\/playwright\/2026-10-08T[\dTZ-]+-ui-js-allocation\.json$/);
const input = await readBounded(receipt.report.path, 4 * 1024 ** 2), raw = JSON.parse(input.bytes);
assert.equal(input.bytes.length, receipt.report.bytes); assert.equal(sha(input.bytes), receipt.report.sha256);
assert.equal(raw.status, "completed-diagnostic"); assert.equal(raw.failure, null); assert.deepEqual(raw.cleanupErrors, []);
assert.deepEqual(raw.forbidden, []); assert.equal(raw.host.safeToStart, true);
assert.ok(raw.host.freePhysicalBytes >= 2147483648 && raw.host.freeVirtualBytes >= 2147483648);
assert.equal(raw.host.primaryMemoryFormulaChanged, false); assert.equal(raw.host.noProcessesKilled, true);
assert.equal(raw.conversionsPerformed, 0); assert.equal(raw.publicAcceptance, false);
assert.equal(raw.completeChromiumMemoryAcceptance, false); assert.equal(raw.conversionSpeedAcceptance, false);
assert.equal(raw.forcedGcUsed, false); assert.equal(raw.nativeAllocationCauseProven, false);
assert.equal(raw.originalSourceBytes, 2958573265);
assert.equal(raw.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
assert.deepEqual(raw.settings, JS_ALLOCATION_SETTINGS); assert.deepEqual(raw.limits, JS_ALLOCATION_LIMITS);
assert.ok(Object.values(raw.cleanup).every(value => value === true));
for (const [file, hash] of Object.entries(raw.sourcePins)) assert.equal(receipt.sourcePins[file], hash, file);
const expectedPhases = ["native-sampling-start", "ui-selections-20", "ui-selections-40", "ui-selections-60", "ui-control-settled-3s"];
assert.deepEqual(raw.profiles.map(row => row.phase), expectedPhases);
assert.equal(raw.rows.length, 7); assert.ok(raw.rows.every(row => row.jobState === null || row.jobState === "idle"));
assert.ok(raw.rows.every(row => row.error === null && row.privateBytes > 0 && row.processes?.length));
assert.ok(raw.rows.every(row => row.privateBytes === row.processes.reduce((sum, process) => sum + process.privateBytes, 0)));
for (const row of raw.profiles) assert.deepEqual(row.summary, summarizeJsAllocation({ profile: row.profile }));
assert.ok(raw.profiles.some(row => row.summary.sourceLocatedSelfBytes > 0), "Must actually observe JS source locations");
assert.ok(raw.stoppedProfileSummary && raw.stoppedProfileSummary.serializedBytes <= JS_ALLOCATION_LIMITS.responseBytes);
const identities = [...new Map(raw.rows.flatMap(row => row.processes).map(process =>
  [JSON.stringify([process.pid, process.parentPid, process.createdAt]), process])).values()];
assert.ok(identities.length > 0 && identities.length <= 128);
for (const process of identities) {
  assert.ok(Number.isSafeInteger(process.pid) && process.pid > 0 && Number.isSafeInteger(process.parentPid));
  assert.ok(typeof process.createdAt === "string" && Number.isFinite(Date.parse(process.createdAt)));
}
const pids = [...new Set([...identities.map(process => process.pid), ...Object.values(raw.ownedPids)])];
assert.ok(pids.every(pid => Number.isSafeInteger(pid) && pid > 0));
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference='Stop'; $jsProbeObservedIds=@(${pids.join(",")}); @(Get-CimInstance Win32_Process | Where-Object { $jsProbeObservedIds -contains [int]$_.ProcessId } | ForEach-Object { [pscustomobject]@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=([datetime]$_.CreationDate).ToUniversalTime().ToString('o')} }) | ConvertTo-Json -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 262144 });
const liveValue = stdout.trim() ? JSON.parse(stdout) : [], live = Array.isArray(liveValue) ? liveValue : [liveValue];
assert.deepEqual(live, [], "Every observed PID must be absent; do not kill or silently ignore a reused PID");
for (const directory of [raw.runtimeDirectory, receipt.wrapperRuntimeDirectory]) {
  assert.match(path.basename(directory), /^ui-js-allocation-(?:wrapper-)?[a-zA-Z0-9]+$/);
  assert.equal(path.dirname(directory), path.join(root, "work"));
  await assert.rejects(access(directory), { code: "ENOENT" });
}
const historicalPath = "evidence/ui-native-allocation-2026-10-06.json", historicalBytes = await readFile(path.join(root, historicalPath));
const historical = JSON.parse(historicalBytes);
assert.equal(historical.browserVersion, raw.browserVersion); assert.equal(historical.nativeStackSymbolsResolved, false);
const historicalRaw = await readBounded(historical.report.path, 65536);
assert.equal(sha(historicalRaw.bytes), historical.report.sha256);
const last = raw.profiles.at(-1), assetNames = new Set();
for (const row of last.summary.topCallsites) for (const frame of [row.callFrame, ...row.exampleStack]) {
  if (!frame.url) continue;
  const url = new URL(frame.url);
  assert.equal(url.hostname, "127.0.0.1"); assert.match(url.pathname, /^\/assets\/[A-Za-z0-9_-]+\.js$/);
  assetNames.add(url.pathname.slice(1));
}
assert.ok(assetNames.size > 0 && assetNames.size <= 8);
const inspectedBundles = {};
for (const asset of assetNames) {
  const file = `dist/client/${asset}`, bytes = (await readBounded(file, 1048576)).bytes;
  inspectedBundles[asset] = { file, bytes: bytes.length, sha256: sha(bytes), inspectedAfterRun: true,
    servedBytesCapturedDuringRun: false };
}
const topCallsites = last.summary.topCallsites.slice(0, 16).map(row => {
  const result = { callFrame: row.callFrame, estimatedSelfBytes: row.estimatedSelfBytes,
    nodeCount: row.nodeCount, exampleStackTail: row.exampleStack.slice(-6) };
  if (row.callFrame.url) {
    result.inspectedBundle = new URL(row.callFrame.url).pathname.slice(1);
  }
  return result;
});
for (const row of topCallsites) if (row.inspectedBundle) {
  const text = await readFile(path.join(root, inspectedBundles[row.inspectedBundle].file), "utf8");
  const line = text.split("\n")[row.callFrame.lineNumber];
  assert.ok(line && row.callFrame.columnNumber <= line.length);
  row.postRunBundleContext = line.slice(Math.max(0, row.callFrame.columnNumber - 60), row.callFrame.columnNumber + 220);
}
const gzipPath = `${receipt.report.path}.gz`, compressed = gzipSync(input.bytes, { level: 9 });
assert.equal(sha(gunzipSync(compressed, { maxOutputLength: 4 * 1024 ** 2 })), receipt.report.sha256);
await writeFile(path.join(root, gzipPath), compressed, { flag: "wx" });
const verifiedGzip = await readBounded(gzipPath, 4 * 1024 ** 2);
assert.deepEqual(gunzipSync(verifiedGzip.bytes, { maxOutputLength: 4 * 1024 ** 2 }), input.bytes);
const currentIdentity = await lstat(input.full, { bigint: true });
for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(currentIdentity[key], input.identity[key]);
assert.equal(await realpath(input.full), input.full); assert.equal(sha(await readFile(input.full)), receipt.report.sha256);
const report = { recordedAt: new Date().toISOString(), status: "verified-js-callsite-tooling-not-conversion-acceptance",
  verifier: { path: "scripts/freeze-ui-js-allocation.mjs", sha256: sha(await readFile(path.join(root, "scripts/freeze-ui-js-allocation.mjs"))) },
  browserVersion: raw.browserVersion, host: raw.host, sourcePins: receipt.sourcePins, generatedControl: receipt.generatedControl,
  receipt: { path: receiptPath, bytes: receiptInput.bytes.length, sha256: sha(receiptInput.bytes) },
  originalReport: receipt.report, compressedReport: { path: gzipPath, bytes: compressed.length, sha256: sha(compressed),
    losslesslyRestoredBytes: input.bytes.length, losslesslyRestoredSha256: sha(input.bytes) },
  settings: raw.settings, limits: raw.limits, profiles: raw.profiles.map(row => ({ phase: row.phase,
    serializedBytes: row.summary.serializedBytes, nodeCount: row.summary.nodeCount, sampleCount: row.summary.sampleCount,
    estimatedSelfBytes: row.summary.estimatedSelfBytes, sourceLocatedSelfBytes: row.summary.sourceLocatedSelfBytes })),
  topCallsites, inspectedBundles, stoppedProfileSummary: { serializedBytes: raw.stoppedProfileSummary.serializedBytes,
    nodeCount: raw.stoppedProfileSummary.nodeCount, sampleCount: raw.stoppedProfileSummary.sampleCount },
  observedRows: raw.rows.map(({ phase, timestamp, dom, heap, privateBytes, rssBytes, jobState }) =>
    ({ phase, timestamp, dom, heap, privateBytes, rssBytes, jobState })),
  observedProcessIdentities: identities.map(({ pid, parentPid, createdAt, type }) => ({ pid, parentPid, createdAt, type })),
  observedPidsAbsent: pids, nativeIdentityCleanupVerified: true, cleanup: raw.cleanup,
  runtimeDirectories: [raw.runtimeDirectory, receipt.wrapperRuntimeDirectory], runtimeDirectoriesAbsent: true,
  historicalNativeSampling: { path: historicalPath, sha256: sha(historicalBytes), browserVersion: historical.browserVersion,
    raw: historical.report, sampleCounts: historical.profiles.map(row => row.profile.samples.length), symbolsResolved: false },
  historicalPhaseNamesOnly: true, nativeSamplerUsedInThisRun: false, jsSourceLocationsObserved: true,
  originalSourceBytes: raw.originalSourceBytes, originalSourceSha256: raw.originalSourceSha256,
  protectedFixturePrePostVerified: true, forbiddenRequests: [], conversionsPerformed: 0, generatedMediaCopies: 0,
  forcedGcUsed: false, includesNaturallyCollectedObjects: true, exactLiveMemory: false,
  nativeAllocationCauseProven: false, primaryMemoryAcceptance: false, conversionSpeedAcceptance: false, publicAcceptance: false,
  rawJsonRemovedAfterVerifiedLosslessCompression: true, bytesSaved: input.bytes.length - compressed.length,
  next: "Do not repeat this idle probe or unresolved native sampler. Integrate bounded JS sampling into actual conversion progress, distinguish automation/runtime allocations, and capture exact served bundle hashes. JS sampling alone cannot explain Blink/native pools or certify primary memory; full-original/repeats/quality/privacy/cleanup gates remain." };
const target = "evidence/ui-js-allocation-tooling-2026-10-08.json", json = JSON.stringify(report, null, 2) + "\n";
assert.ok(Buffer.byteLength(json) <= 65536); await assert.rejects(access(path.join(root, target)), { code: "ENOENT" });
await unlink(input.full); await assert.rejects(access(input.full), { code: "ENOENT" });
await writeFile(path.join(root, target), json, { flag: "wx" });
console.log(JSON.stringify({ target, status: report.status, profileCounts: report.profiles, bytesSaved: report.bytesSaved,
  observedIdentities: identities.length, pidsAbsent: pids.length, gzipPath }));
