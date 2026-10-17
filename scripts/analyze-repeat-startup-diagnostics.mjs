// Read-only independent audit; writes only a new compact evidence receipt.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamps = ["2026-10-17T01-42-13-915Z", "2026-10-17T01-46-15-878Z", "2026-10-17T01-51-12-049Z"];
const records = [], identities = [];
async function unpack(record, maximum = 8388608) {
  const zipped = await read(record.path);
  assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: maximum });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
for (const stamp of stamps) {
  const file = `evidence/${stamp}-repeat-startup-diagnostic.json`, bytes = await read(file), terminal = JSON.parse(bytes);
  assert.equal(terminal.status, "failed-not-accepted"); assert.equal(terminal.publicAcceptance, false);
  assert.equal(terminal.productionRestored, true); assert.equal(terminal.runtimeRemoved, true);
  assert.deepEqual(terminal.cleanupErrors, []); assert.deepEqual(terminal.protectedBefore, terminal.protectedAfter);
  assert.deepEqual(terminal.sourcePins, terminal.postSourcePins);
  assert.equal(Object.keys(terminal.sourcePins).length, 373);
  const source = await unpack(terminal.sourceArchive);
  assert.deepEqual(source.sourcePins, terminal.sourcePins);
  const evolvedHarnessFiles = [];
  for (const [name, digest] of Object.entries(terminal.sourcePins)) {
    if (Object.hasOwn(source.preimages, name)) assert.equal(sha(Buffer.from(source.preimages[name], "base64")), digest);
    const current = sha(await read(name));
    if (name.includes("repeat-startup")) {
      if (current !== digest) evolvedHarnessFiles.push(name);
    } else assert.equal(current, digest, name);
  }
  const report = await unpack(terminal.report);
  const historyRow = report.rows.find(row => row.kind === "repeat-startup-native-history");
  assert.equal(historyRow.observerAbsence.status, "owned-identity-absent");
  identities.push(historyRow.monitorIdentity, ...historyRow.history.identities);
  identities.push(...terminal.helpers.launchRecords.map(row => row.identity));
  await assert.rejects(access(terminal.runtimeDirectory), { code: "ENOENT" });
  await assert.rejects(access(terminal.helpers.runtime), { code: "ENOENT" });
  assert.equal(terminal.fixtureCleanup.ownedDirectoryAbsent, true);
  const actualOutputs = report.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc" && row.destination === "direct");
  // Attached-picture-preservation also says status=passed: never count that row
  // as an additional independently validated conversion.
  assert.equal(actualOutputs.length, 1);
  const output = actualOutputs[0];
  assert.equal(output.outputBytes, 2245626); assert.equal(Number(output.frames), 96);
  assert.equal(output.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c");
  assert.equal(output.ssim, 0.983095);
  const job = report.rows.find(row => row.kind === "repeat-startup-job");
  assert.equal(job.iteration, 1); assert.equal(job.noPageReload, true);
  const peak = job.nativePeak.peak, baseline = historyRow.baseline;
  assert.equal(baseline.stable, true);
  assert.equal(peak.privateBytes, peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
  const incrementalPrivateMiB = (peak.privateBytes - baseline.privateBytes) / 1024 ** 2;
  assert.ok(incrementalPrivateMiB > 250);
  const events = job.startupEvents, apiEnd = Math.max(...events.filter(e => e.event === "end").map(e => e.epochMs));
  const unavailable = historyRow.history.timeline.filter(row => row[6] != null);
  for (const row of unavailable) { assert.equal(row[3], null); assert.equal(row[4], null); assert.equal(row[7], null); }
  const matchedCss = report.rows.filter(row => row.kind === "repeat-startup-matched-full-stylesheet");
  for (const row of matchedCss) {
    assert.equal(row.sha256, "81862974af7b02ede01b5122b4a8bc372600fb6f528bd11fabee2687ea78e311");
    assert.deepEqual(row.viewport, { width: 1280, height: 900 });
  }
  records.push({ terminal: { path: file, sha256: sha(bytes) }, sourceArchive: terminal.sourceArchive, report: terminal.report,
    validatedConversions: actualOutputs.length, attemptedConversions: 1,
    terminalCountCorrection: terminal.analysis.completedValidatedSmallRuns !== 1 ? "Legacy diagnostic count includes attached-artwork pass; actual conversions=1" : null,
    evolvedHarnessFiles, baseline, peak, incrementalPrivateMiB, validJobSamples: job.nativePeak.validSamples,
    unavailableJobSamples: job.nativePeak.unavailableSamples, unavailableReadings: unavailable.map(row => ({ sequence: row[0], timestamp: row[1], error: row[6] })),
    startupEvents: events, peakAfterFinalStartupApiReturnMs: Date.parse(peak.timestamp) - apiEnd,
    fullTestCssAndViewportMatched: matchedCss.length === 1,
    traceScreenshotsAndSnapshotsDisabled: source.recipe.generated.config.includes('"screenshots":false,"snapshots":false,"sources":false'),
    output: { bytes: output.outputBytes, sha256: output.outputSha256, frames: 96, ssim: output.ssim, elapsedMs: output.metrics.elapsedMs },
    allocationCause: null, completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false });
}
// One current read-only OS snapshot checks every recorded birth, without
// launching dozens of PowerShell helpers or touching unrelated processes.
const script = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
  { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const current = JSON.parse(stdout);
const births = identities.map(identity => {
  const live = current.find(row => row.pid === identity.pid);
  const sameBirth = live && Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) <= 1;
  assert.ok(!sameBirth, "Owned browser/monitor/helper still alive");
  return { identity, status: live ? "pid-reused-owned-birth-absent-no-action" : "owned-birth-absent" };
});
const original = path.join(root, "test.mkv"), size = (await lstat(original)).size;
assert.equal(size, 2958573265);
const hash = createHash("sha256");
for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex");
assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const tracePath = `outputs/reports/${stamps[2]}-repeat-startup-trace.zip`, trace = await read(tracePath);
assert.ok(trace.length <= 8388608);
const ownPath = "scripts/analyze-repeat-startup-diagnostics.mjs", ownBytes = await read(ownPath);
const result = { recordedAt: new Date().toISOString(), status: "three-negative-controls-audited-not-accepted", records, births,
  trace: { path: tracePath, bytes: trace.length, sha256: sha(trace) }, original: { bytes: size, sha256: originalSha256 },
  ownSource: { path: ownPath, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") },
  conclusion: "All three short controls exceeded 250MiB. Neither matched layout nor reduced trace capture resolved excess. Startup API return precedes peak, but asynchronous compilation/codec/UI allocation cause remains unproven. Small-suite Chrome launch differs from full driver; do not infer that full original Run1 failed, or retry unchanged full conversion.",
  nextAction: "Use the actual full driver's Chromium launch and cancellation/trace capture for a bounded original-file startup control; compare renderer/allocator state at first excess before planning any full retry.",
  publicAcceptance: false, fullOriginalAcceptance: false, allocationCause: null };
const output = "evidence/2026-10-17-repeat-startup-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, increments: records.map(r => r.incrementalPrivateMiB), originalSha256, birthsChecked: births.length }));
