import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile, access, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeUpdatedFullArchive } from "./lib/recorded-timeline-full-sources.mjs";
const root = process.cwd(), read = file => readFile(path.join(root, file));
const terminalPath = "evidence/2026-10-17T17-26-47-168Z-bounded-catalogue-control-terminal.json";
const terminalBytes = await read(terminalPath), terminal = JSON.parse(terminalBytes);
const zipped = await read(terminal.report.path); assert.equal(sha(zipped), terminal.report.sha256);
const raw = gunzipSync(zipped); assert.equal(sha(raw), terminal.report.restoredSha256); const report = JSON.parse(raw);
assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
assert.equal(report.runs.length, 0); assert.equal(report.loadedIdle, null);
assert.ok(report.failure.message.includes("ebceb6d67d2a64a259efcf73cea899aa8bb2dda44c51de85613e22b718c24794"));
assert.equal(report.nativeFailureCapture.firstFailure, null);
const source = await materializeUpdatedFullArchive(root, terminal.sourceArchive);
assert.equal(Object.keys(source.pins).length, 802); assert.deepEqual(source.pins, terminal.sourcePins); assert.deepEqual(source.pins, terminal.postSourcePins);
for (const [file, digest] of Object.entries(source.pins)) assert.equal(sha(await read(file)), digest, file);
const traceFile = path.join(root, "outputs/reports/2026-10-17T17-27-16-285Z-private-mpeg2-updated-chrome-full-native-100ms-trace.zip");
const command = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.IO.Compression.FileSystem; $catalogueArchive=[IO.Compression.ZipFile]::OpenRead('" + traceFile.replaceAll("'", "''") + "'); try {$catalogueReader=[IO.StreamReader]::new($catalogueArchive.GetEntry('trace.trace').Open());try{[Console]::Write($catalogueReader.ReadToEnd())}finally{$catalogueReader.Dispose()}}finally{$catalogueArchive.Dispose()}";
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, maxBuffer: 1048576, timeout: 15000 });
const captured = [];
for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
  const row = JSON.parse(line); if (row.type !== "after" || !row.result?.value?.a) continue;
  const values = row.result.value.a;
  if (!values.length || !values[0].o?.some(item => item.k === "html")) continue;
  for (const item of values) captured.push(Object.fromEntries(item.o.map(field => [field.k, field.v.s])));
}
assert.equal(captured.length, 405);
const original = captured.map(row => row.html), normalized = original.map(html => html.replaceAll("<!-- -->", ""));
assert.equal(sha(JSON.stringify(original)), "ebceb6d67d2a64a259efcf73cea899aa8bb2dda44c51de85613e22b718c24794");
assert.equal(sha(JSON.stringify(normalized)), "98ea6da45e457c1067dc6edbffd97443b9dea1ee706fe9ecce20b0938e15cf40");
assert.equal(sha(JSON.stringify(captured.map(row => row.id))), "e978d6819e6b1dfaa3d71339f60919b3174d7e3fc2e214eed56d72efa1a1b996");
const directories = [terminal.wrapper, terminal.candidateDirectory, terminal.callerRuntimeDirectory,
  report.runtimeDirectory, report.cleanup.completedSaveFixture.fixtureDirectory];
for (const directory of directories) { assert.ok(directory.startsWith(path.join(root, "work") + path.sep)); await assert.rejects(access(directory), { code: "ENOENT" }); }
const currentCommand = "ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o')}}) -Compress";
const processes = JSON.parse((await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", currentCommand], { windowsHide: true, timeout: 15000, maxBuffer: 1048576 })).stdout);
const births = terminal.treeCleanupAudit.recordedBirths.map(identity => {
  const live = processes.find(row => row.pid === identity.pid); assert.ok(!live || Math.abs(Date.parse(live.createdAt) - Date.parse(identity.createdAt)) > 1);
  return { identity, status: live ? "owned-birth-absent-pid-reused-no-action" : "owned-birth-absent" };
});
assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")), "f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
const stat = await lstat(path.join(root, "test.mkv")); assert.equal(stat.size, 2958573265); assert.ok(stat.isFile() && !stat.isSymbolicLink());
const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) hash.update(chunk);
const originalSha256 = hash.digest("hex"); assert.equal(originalSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const checkpoint = report.nativeMemory.durableCheckpoint.file; assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"));
const checkpointRaw = await readFile(checkpoint), checkpointZip = gzipSync(checkpointRaw, { level: 9 });
assert.deepEqual(JSON.parse(checkpointRaw).native.identities, report.nativeMemory.identities);
await writeFile(checkpoint + ".gz", checkpointZip, { flag: "wx" }); assert.deepEqual(gunzipSync(await readFile(checkpoint + ".gz")), checkpointRaw); await rm(checkpoint);
const result = { recordedAt: new Date().toISOString(), status: "preconversion-check-failure-attributed-to-empty-react-hydration-comments",
  terminal: { path: terminalPath, sha256: sha(terminalBytes) }, sourceArchive: terminal.sourceArchive, all802ExecutedCurrentPostPinsEqual: true,
  trace: { path: path.relative(root, traceFile), sha256: sha(await readFile(traceFile)) }, capturedCards: captured.length,
  capturedIdsSha256: sha(JSON.stringify(captured.map(row => row.id))), originalHtmlSha256: sha(JSON.stringify(original)),
  emptyReactSeparatorCount: original.reduce((sum, html) => sum + html.split("<!-- -->").length - 1, 0),
  cardsWithEmptySeparators: original.filter(html => html.includes("<!-- -->")).length,
  exactReferenceHtmlAfterRemovingOnlyLiteralEmptyComments: true, normalizedHtmlSha256: sha(JSON.stringify(normalized)),
  conversionsStarted: 0, memoryAcceptance: false, publicAcceptance: false, directoriesAbsent: directories, births,
  original: { bytes: stat.size, sha256: originalSha256 },
  checkpoint: { path: path.relative(root, checkpoint + ".gz"), bytes: checkpointZip.length, sha256: sha(checkpointZip), restoredBytes: checkpointRaw.length, restoredSha256: sha(checkpointRaw) },
  nextAction: "Compare exact card HTML after removing ONLY literal React empty-comment separators. Retain all text/elements/attributes/route order. Add a regression for production hydration; rerun the unchanged conversion memory gate only after this adapter correction." };
const output = "evidence/2026-10-17-bounded-catalogue-hydration-analysis.json";
await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, capturedCards: result.capturedCards, emptyReactSeparatorCount: result.emptyReactSeparatorCount, cardsWithEmptySeparators: result.cardsWithEmptySeparators, birthsChecked: births.length, conversions: 0, originalSha256 }));
