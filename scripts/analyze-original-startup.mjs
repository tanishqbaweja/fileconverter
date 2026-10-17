import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
import { inspectOriginalStartupObservation } from "./lib/original-startup-observation.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminalPath = "evidence/2026-10-17T02-01-05-994Z-original-startup-terminal.json";
const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const zipped = await read(terminal.report.path);
assert.equal(zipped.length, terminal.report.bytes); assert.equal(sha(zipped), terminal.report.sha256);
const raw = gunzipSync(zipped, { maxOutputLength: 33554432 });
assert.equal(raw.length, terminal.report.restoredBytes); assert.equal(sha(raw), terminal.report.restoredSha256);
const report = JSON.parse(raw), analysis = inspectOriginalStartupObservation(terminal, report);
const sources = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(sources.pins).length, 771);
assert.deepEqual(sources.pins, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
assert.deepEqual(report.sourceHashes, terminal.sourcePins);
assert.ok(sources.traceHelper.includes("2026-10-17T02-01-05-994Z"));
assert.ok(!sources.traceHelper.includes("2026-10-15T22-27-06-823Z"));
const body = await read(terminal.sourceArchive.path);
assert.equal(sha(body), terminal.sourceArchive.sha256);
for (const directory of [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory, report.runtimeDirectory])
  await assert.rejects(access(directory), { code: "ENOENT" });
const recorded = terminal.treeCleanupAudit.recordedBirths;
const command = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
  { windowsHide: true, timeout: 15000, maxBuffer: 1048576 });
const current = JSON.parse(stdout), births = recorded.map(identity => {
  const row = current.find(process => process.pid === identity.pid);
  assert.ok(!row || Math.abs(Date.parse(row.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, status: row ? "owned-birth-absent-pid-reused-no-action" : "owned-birth-absent" };
});
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const original = path.join(root, "test.mkv"), row = await lstat(original);
assert.equal(row.size, 2958573265); assert.ok(row.isFile() && !row.isSymbolicLink());
const digest = createHash("sha256");
for await (const chunk of createReadStream(original, { highWaterMark: 1048576 })) digest.update(chunk);
const originalSha256 = digest.digest("hex");
assert.equal(originalSha256, report.source.sha256);
const base = "outputs/reports/2026-10-17T02-01-41-822Z-private-mpeg2-updated-chrome-full-native-100ms";
const checkpointPath = base + "-native-checkpoint.json", checkpoint = await read(checkpointPath);
const parsed = JSON.parse(checkpoint); assert.deepEqual(parsed.native.identities, report.nativeMemory.identities);
const compressed = gzipSync(checkpoint, { level: 9 }); assert.deepEqual(gunzipSync(compressed), checkpoint);
await writeFile(path.join(root, checkpointPath + ".gz"), compressed, { flag: "wx" });
assert.equal(sha(gunzipSync(await read(checkpointPath + ".gz"))), sha(checkpoint));
await rm(path.join(root, checkpointPath));
const trace = await read(base + "-trace.zip");
const ownFiles = ["scripts/analyze-original-startup.mjs", "scripts/lib/original-startup-observation.mjs", "tests/original-startup-observation.test.mjs"];
const own = {};
for (const file of ownFiles) { const bytes = await read(file); own[file] = { sha256: sha(bytes), preimage: bytes.toString("base64") }; }
const result = { recordedAt: new Date().toISOString(), analysis,
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, sourceArchive: terminal.sourceArchive,
  all771ExecutedCurrentPostPinsEqual: true, report: terminal.report, births,
  original: { bytes: row.size, sha256: originalSha256 }, normalProductionRestored: true,
  checkpoint: { path: checkpointPath + ".gz", bytes: compressed.length, sha256: sha(compressed),
    restoredBytes: checkpoint.length, restoredSha256: sha(checkpoint), redundantRawRemovedAfterReplay: true },
  trace: { path: base + "-trace.zip", bytes: trace.length, sha256: sha(trace) }, ownSources: own,
  nextAction: "Short original startup cancellation did not reproduce long-run excess. Isolate native-validation idle duration and successful save handoff retention before any unchanged full-file retry. This evidence does not resolve long-run memory or qualify a public profile." };
const output = "evidence/2026-10-17-original-startup-independent-analysis.json";
await writeFile(path.join(root, output), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, peaks: analysis.runs.map(run => run.incrementalPrivateMiB), birthsChecked: births.length, originalSha256 }));
