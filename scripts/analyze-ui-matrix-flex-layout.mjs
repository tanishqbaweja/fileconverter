// Independent read-only freeze, including rejected geometry and ALL native processes.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { microsecondBirth } from "./lib/microsecond-native-type-join.mjs";
import { joinUiLargestBlinkTypes } from "./lib/ui-largest-blink-join.mjs";

const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const input = path.resolve(root, process.argv[2] ?? "");
assert.equal(path.dirname(input), path.join(root, "evidence"));
assert.ok(path.basename(input).endsWith("-ui-matrix-flex-layout.json"));
const bytes = await readFile(input), proof = JSON.parse(bytes);
assert.equal(proof.proofs.length, 2); assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.publicAcceptance, false);
for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
const raws = [];
for (const mode of proof.proofs) {
  assert.equal(mode.status, "completed-diagnostic");
  for (const [file, hash] of Object.entries(mode.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  for (const [name, source] of Object.entries(mode.generatedSources)) assert.equal(sha(source), mode.generatedHashes[name]);
  const rawPath = path.resolve(root, mode.rawReport.path);
  assert.ok(rawPath.startsWith(path.join(root, "output", "playwright") + path.sep));
  const rawBytes = await readFile(rawPath); assert.equal(rawBytes.length, mode.rawReport.bytes); assert.equal(sha(rawBytes), mode.rawReport.sha256);
  const raw = JSON.parse(rawBytes); raws.push(raw);
  assert.deepEqual(joinUiLargestBlinkTypes(raw.traceReports, raw.rows), mode.joined);
  assert.deepEqual(raw.layoutExperiment, mode.layoutExperiment);
  assert.deepEqual(mode.cleanupErrors, []); assert.equal(mode.failure, null); assert.deepEqual(raw.forbidden, []);
  for (const value of Object.values(mode.cleanup)) assert.equal(value, true);
  for (const directory of [mode.runtimeDirectory, mode.outerRuntimeDirectory]) {
    assert.ok(path.resolve(directory).startsWith(path.join(root, "work") + path.sep));
    await assert.rejects(access(directory), { code: "ENOENT" });
  }
}
assert.equal(proof.geometry.length, 9);
const geometry = proof.geometry.map((g, index) => {
  const [a, b] = proof.proofs.map(p => p.layoutExperiment.geometry[index]);
  assert.equal(a.profileId, b.profileId); assert.deepEqual(a.viewport, b.viewport);
  const sameControls = JSON.stringify(a.controls) === JSON.stringify(b.controls);
  const sameMarkup = a.rows.length === b.rows.length && a.rows.every((r, i) => r.selector === b.rows[i].selector && r.index === b.rows[i].index && r.htmlSha256 === b.rows[i].htmlSha256);
  const maxDifferenceCssPixels = sameMarkup ? Math.max(...a.rows.flatMap((r, i) => ["x", "y", "width", "height"].map(k => Math.abs(r[k] - b.rows[i][k])))) : null;
  assert.equal(g.sameControls, sameControls); assert.equal(g.sameMarkup, sameMarkup); assert.equal(g.maxDifferenceCssPixels, maxDifferenceCssPixels);
  assert.equal(g.pass, sameControls && sameMarkup && maxDifferenceCssPixels <= 1);
  return { profileId: a.profileId, viewport: a.viewport, sameControls, sameMarkup, maxDifferenceCssPixels, pass: g.pass };
});
const identities = raws.flatMap(r => r.rows.flatMap(row => row.processes ?? []));
const unique = [...new Map(identities.map(p => [`${p.pid}/${p.parentPid}/${microsecondBirth(p.createdAt)}`, p])).values()];
assert.ok(unique.length > 0 && unique.length <= 128);
const pids = [...new Set([...unique.map(p => p.pid), ...proof.proofs.flatMap(p => Object.values(p.ownedPids))])];
const query = pids.map(pid => { assert.ok(Number.isSafeInteger(pid) && pid > 0); return `ProcessId = ${pid}`; }).join(" or ");
const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
  `$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process -Filter '${query}' | ForEach-Object { @{ pid = $_.ProcessId; parentPid = $_.ParentProcessId; createdAt = $_.CreationDate.ToUniversalTime().ToString('o') } }) -Compress`],
{ windowsHide: true, timeout: 15000, maxBuffer: 131072 });
const current = JSON.parse(stdout);
assert.deepEqual(current.filter(p => unique.some(old => old.pid === p.pid && old.parentPid === p.parentPid && microsecondBirth(old.createdAt) === microsecondBirth(p.createdAt))), []);
for (const p of current.filter(p => !unique.some(old => old.pid === p.pid)))
  assert.ok(Date.parse(p.createdAt) > Date.parse(proof.recordedAt), "Helper must be absent or definitively newer birth");
const fixture = path.join(root, "test.mkv"), hash = createHash("sha256");
assert.equal((await stat(fixture)).size, 2958573265);
for await (const chunk of createReadStream(fixture, { highWaterMark: 1048576 })) hash.update(chunk);
assert.equal(hash.digest("hex"), "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
const modes = proof.proofs.map(mode => {
  const [a, b] = mode.rows.filter(r => ["native-sampling-start", "ui-control-settled-3s"].includes(r.phase));
  const renderer = mode.joined.find(r => r.traceName?.startsWith("Renderer")); assert.ok(renderer);
  const heap = heaps => heaps.find(h => h.name === "blink_gc/main/heap");
  const types = renderer.types.filter(t => /GridSizingTrackCollection|PlainTextNode|FlexItem|FlexLine/.test(t.type));
  return { mode: mode.mode, fullTreePrivateBeforeBytes: a.privateBytes, fullTreePrivateAfterBytes: b.privateBytes,
    fullTreePrivateDeltaBytes: a.privateBytes == null || b.privateBytes == null ? null : b.privateBytes - a.privateBytes,
    embedderGrowthBytes: b.heap.embedderHeapUsedSize - a.heap.embedderHeapUsedSize,
    mainBlinkAllocatedGrowthBytes: heap(renderer.afterHeaps).allocatedObjectsBytes - heap(renderer.beforeHeaps).allocatedObjectsBytes,
    mainBlinkResidentGrowthBytes: heap(renderer.afterHeaps).residentBytes - heap(renderer.beforeHeaps).residentBytes,
    selectedTypes: types, gridTrackGrowthBytes: types.find(t => /GridSizingTrackCollection/.test(t.type))?.deltaAllocatedObjectsBytes ?? null,
    nativeSampleCount: mode.rows.length, unavailableNativeSamples: mode.rows.filter(r => r.privateBytes == null).length,
    addedProcessIdentitiesAtAfterSnapshot: b.processes.filter(p => !a.processes.some(old => old.pid === p.pid && old.parentPid === p.parentPid && old.createdAt === p.createdAt)),
    snapshotsNotContinuousPeaks: true, missingTypesAreUnavailableNotZero: true };
});
const output = input.replace(/\.json$/, "-analysis.json");
await assert.rejects(access(output), { code: "ENOENT" });
const analysis = { recordedAt: new Date().toISOString(), status: "verified-terminal-matrix-layout-pair-not-public-acceptance",
  evidenceStatus: proof.status, sourcePins: { [path.relative(root, input).replaceAll("\\", "/")]: sha(bytes),
    "scripts/analyze-ui-matrix-flex-layout.mjs": sha(await readFile(path.join(root, "scripts/analyze-ui-matrix-flex-layout.mjs"))) },
  modes, geometry, candidateGeometryAccepted: geometry.every(g => g.pass),
  cleanup: { sampledIdentities: unique.length, checkedPids: pids.length, allSampledIdentitiesAbsent: true,
    allObservedPidsAbsent: current.length === 0, observedProcesses: current, fourScratchDirectoriesAbsent: true,
    protectedFullPostHashMatches: true, noProcessesKilled: true },
  conversionsPerformed: 0, generatedMediaCopies: 0, publicAcceptance: false, completeChromiumMemoryAcceptance: false,
  conversionSpeedAcceptance: false, originalFailureAllocationCause: null, publishedFilesChanged: false,
  caveat: "Independent raw/hash/generated-source/join/geometry/cleanup verification; partial types include garbage and overlap. No original peak allocation cause, native continuous acceptance, speed or public promotion from this idle UI diagnostic." };
const json = JSON.stringify(analysis, null, 2) + "\n"; assert.ok(Buffer.byteLength(json) < 65536);
await writeFile(output, json, { flag: "wx" });
console.log(JSON.stringify({ output, status: analysis.status, modes: modes.map(m => ({ ...m, selectedTypes: m.selectedTypes.length })), geometry, cleanup: analysis.cleanup }));
