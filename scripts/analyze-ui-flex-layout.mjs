// Terminal read-only analysis; retain full-tree results even when a heap metric improves.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePins = {}, proofs = [];
for (const mode of ["grid", "flex"]) {
  const input = `evidence/ui-${mode}-layout-2026-10-07.json`, bytes = await readFile(path.join(root, input)), proof = JSON.parse(bytes);
  assert.equal(proof.status, "completed-diagnostic"); assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  for (const [name, source] of Object.entries(proof.generatedSources)) assert.equal(sha(source), proof.generatedHashes[name]);
  const raw = await readFile(path.join(root, proof.rawReport.path)); assert.equal(raw.length, proof.rawReport.bytes); assert.equal(sha(raw), proof.rawReport.sha256);
  assert.deepEqual(proof.cleanupErrors, []); for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  for (const directory of [proof.runtimeDirectory, proof.outerRuntimeDirectory]) {
    assert.ok(path.resolve(directory).startsWith(path.join(root, "work") + path.sep));
    await assert.rejects(access(directory), { code: "ENOENT" });
  }
  sourcePins[input] = sha(bytes); proofs.push(proof);
}
const comparisonPath = "evidence/ui-flex-layout-comparison-2026-10-07.json", comparisonBytes = await readFile(path.join(root, comparisonPath));
const comparison = JSON.parse(comparisonBytes); assert.equal(comparison.status, "paired-layout-geometry-pass-not-public-acceptance");
assert.equal(comparison.geometry.length, 9); assert.ok(comparison.geometry.every(row => row.sameMarkup && row.sameControls && row.maxDifferenceCssPixels === 0));
sourcePins[comparisonPath] = sha(comparisonBytes);
const identities = proofs.flatMap(proof => proof.rows.flatMap(row => row.processes ?? []));
const uniqueIdentities = [...new Map(identities.map(p => [`${p.pid}/${p.parentPid}/${microsecondBirth(p.createdAt)}`, p])).values()];
assert.ok(uniqueIdentities.length <= 128);
const pids = [...new Set([...uniqueIdentities.map(p => p.pid), ...proofs.flatMap(p => Object.values(p.ownedPids))])];
const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.deepEqual(current.filter(p => uniqueIdentities.some(old => old.pid === p.pid && old.parentPid === p.parentPid && microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), []);
for (const p of current.filter(p => !uniqueIdentities.some(old => old.pid === p.pid)))
  assert.ok(Date.parse(p.createdAt) > Math.max(...proofs.map(proof => Date.parse(proof.recordedAt))), "Helper absent or definitively newer birth required");
const hash = createHash("sha256"); assert.equal((await stat(path.join(root, "test.mkv"))).size, 2958573265);
for await (const chunk of createReadStream(path.join(root, "test.mkv"), { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const modes = proofs.map(proof => {
  const [before, after] = proof.rows.filter(row => ["native-sampling-start", "ui-control-settled-3s"].includes(row.phase));
  const renderer = proof.joined.find(row => row.traceName?.startsWith("Renderer")); assert.ok(renderer);
  const grid = renderer.types.find(t => t.type.startsWith("blink::GridSizingTrackCollection ")); assert.ok(grid);
  const heap = rows => rows.find(h => h.name === "blink_gc/main/heap");
  return { mode: proof.mode, fullTreePrivateBeforeBytes: before.privateBytes, fullTreePrivateAfterBytes: after.privateBytes,
    fullTreePrivateDeltaBytes: after.privateBytes - before.privateBytes,
    embedderGrowthBytes: after.heap.embedderHeapUsedSize - before.heap.embedderHeapUsedSize,
    mainBlinkAllocatedGrowthBytes: heap(renderer.afterHeaps).allocatedObjectsBytes - heap(renderer.beforeHeaps).allocatedObjectsBytes,
    mainBlinkResidentGrowthBytes: heap(renderer.afterHeaps).residentBytes - heap(renderer.beforeHeaps).residentBytes,
    gridTrackGrowthBytes: grid.deltaAllocatedObjectsBytes, gridTrackGrowthObjects: grid.deltaObjectCount,
    plainTextGrowthBytes: renderer.types.find(t => t.type.startsWith("blink::PlainTextNode "))?.deltaAllocatedObjectsBytes ?? null,
    addedProcessIdentitiesAtAfterSnapshot: after.processes.filter(p => !before.processes.some(old => old.pid === p.pid && old.parentPid === p.parentPid && old.createdAt === p.createdAt)),
    missingTypesAreUnavailableNotZero: true, snapshotsNotContinuousNativePeaks: true };
});
for (const file of ["scripts/analyze-ui-flex-layout.mjs", "scripts/lib/microsecond-native-type-join.mjs"])
  sourcePins[file] = sha(await readFile(path.join(root, file)));
const analysis = { recordedAt: new Date().toISOString(), status: "terminal-readonly-flex-layout-pair-not-public-acceptance", sourcePins,
  modes, gridTrackGrowthReductionPercent: 100 * (1 - modes[1].gridTrackGrowthBytes / modes[0].gridTrackGrowthBytes),
  embedderGrowthReductionBytes: modes[0].embedderGrowthBytes - modes[1].embedderGrowthBytes,
  mainBlinkAllocatedGrowthReductionBytes: modes[0].mainBlinkAllocatedGrowthBytes - modes[1].mainBlinkAllocatedGrowthBytes,
  geometryCases: 9, identicalGeometryMarkupControls: true, publishedMatrixCards: 405,
  fullTreeImprovementProven: false, sameNativeIdentityAcrossFreshModes: false,
  cleanup: { sampledIdentities: uniqueIdentities.length, checkedPids: pids.length, allSampledIdentitiesAbsent: true,
    allObservedPidsAbsent: current.length === 0, observedProcesses: current, fourScratchDirectoriesAbsent: true,
    protectedFullPostHashMatches: true, noProcessesKilled: true },
  productionChanged: false, originalConversionCause: null, conversionsPerformed: 0, generatedMediaCopies: 0,
  publicAcceptance: false, originalFullSourceMemoryAcceptance: false, conversionSpeedAcceptance: false,
  nextGate: "Candidate may be tested privately against actual full original with unchanged complete-tree250MiB/lower five-minute blank/quality/fidelity/cleanup. Never promote from smaller heap/snapshots alone; no repeated unchanged original or offscreen deferral.",
  caveat: "91.3% smaller retained grid-track growth and identical9geometries are observed for this pair, not live-object/causal/original-spike proof. Complete private snapshot was higher for flex and includes additional real Chromium browser/updater births: retain ALL of them, never filter to accept. Fresh modes have different PIDs/births/type pointer suffixes. DOM/event-listener and PlainTextNode growth remains. No conversion/fidelity/speed or continuous primary gate measured; production untouched." };
const file = path.join(root, "evidence/ui-flex-layout-analysis-2026-10-07.json"); await writeFile(file, JSON.stringify(analysis, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ file, modes, cleanup: analysis.cleanup, reductionPercent: analysis.gridTrackGrowthReductionPercent }));
