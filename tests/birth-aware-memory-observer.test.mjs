import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { makeBirthAwareMemoryObserver, ORIGINAL_WINDOWS_OBSERVER_SHA256 } from "../scripts/lib/birth-aware-memory-observer-source.mjs";
import { validateBirthOwnershipProofs } from "../scripts/lib/birth-aware-chromium-memory.mjs";
const source = await readFile("scripts/lib/windows-tree-monitor.cs", "utf8"), helper = await readFile("scripts/lib/windows-process-birth-proof.cs", "utf8");

test("new observer is an exactly reversible ownership-only derivative; old source and primary private-memory/null paths remain intact", () => {
  const candidate = makeBirthAwareMemoryObserver(source, helper); assert.equal(candidate.baselineSha256, ORIGINAL_WINDOWS_OBSERVER_SHA256);
  let reversed = candidate.generated.slice(0, -helper.length - 1);
  for (const [before, after] of candidate.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); assert.throws(() => makeBirthAwareMemoryObserver(source + "\n", helper));
  for (const preserved of ["privateTotal += pair.Value.row.privateBytes", "result.processes=null; result.privateBytes=null; result.rssBytes=null;",
    "queue.Count >= 256", "selected.Count >= 128", "intervalMs < 100 || intervalMs > 1000"])
    assert.ok(candidate.generated.includes(preserved));
  assert.equal(candidate.memoryFormulaChanged, false); assert.equal(candidate.processNameOrSandboxExclusions, false);
});

test("birth guard runs before private-memory read, with conservative microsecond intervals and no permission/name bypass", () => {
  const { generated } = makeBirthAwareMemoryObserver(source, helper);
  assert.ok(generated.indexOf("if (ExcludeByBirth(pid, parent, created") < generated.indexOf("if (!GetProcessMemoryInfo("));
  assert.match(generated, /ProcessBirthEvidence.Query\(pid\)/); assert.match(generated, /throw failure; \/\/ Owned or unproven/);
  assert.match(generated, /Read\(entry.pid, entry.parentPid, entry.exe, 0, identity.Value\)/);
  assert.match(generated, /Read\(pair.Value.pid, pair.Value.parentPid, pair.Value.exe, selected\[/);
  assert.match(helper, /checked\(earliest \+ 9\)/); assert.match(helper, /latest < minimumCreated/);
  assert.match(helper, /expectedCreated < earliest \|\| expectedCreated > latest/);
  assert.doesNotMatch(helper, /WHERE Name|csrss|chrome|Terminate|Kill\(/);
});

test("bounded ownership receipts reject overlapping precision, unknown justification, backwards counters and fabricated births", () => {
  const proof = { pid: 2, parentPid: 1, earliestFileTime: "134000000000000000", latestFileTime: "134000000000000009",
    boundaryFileTime: "134000000000000010", source: "Win32_Process.CreationDate", reason: "predates-current-parent", observations: 1 };
  const batch = () => ({ birthFallbackQueries: 1, ownershipProofs: [{ ...proof }] });
  assert.equal(validateBirthOwnershipProofs(batch()), 1);
  for (const mutate of [b => { b.ownershipProofs[0].boundaryFileTime = proof.latestFileTime; }, b => { b.ownershipProofs[0].source = "guessed"; },
    b => { b.ownershipProofs[0].earliestFileTime = "0"; }, b => { b.ownershipProofs[0].observations = 0; }, b => { b.ownershipProofs = Array(33).fill(proof); }]) {
    const value = batch(); mutate(value); assert.throws(() => validateBirthOwnershipProofs(value));
  }
  assert.throws(() => validateBirthOwnershipProofs(batch(), 2));
  const reused = batch(); reused.ownershipProofs[0].reason = "previous-owned-pid-reused";
  assert.equal(validateBirthOwnershipProofs(reused), 1);
  reused.ownershipProofs[0].boundaryFileTime = "134000000000000005"; assert.throws(() => validateBirthOwnershipProofs(reused));
});

test("retained real native probe exercises protected-read denial without hiding owned unreadable processes and captures a real allocated child", async () => {
  const report = JSON.parse(await readFile("outputs/reports/2026-10-25T09-09-43.886Z-birth-aware-memory-observer.json"));
  assert.equal(report.status, "passed-birth-aware-observer-native-and-child-smoke"); assert.equal(report.publicAcceptance, false);
  const guard = report.nativeGuard;
  for (const key of ["protectedQueryActuallyDenied", "realOwnedMemoryRead", "unexcludedUnreadableStillFails", "microsecondIntervalBoundaries", "invalidBirthAndPidRejected", "syntheticParentLinkOnly", "noApplicationsClosed"])
    assert.equal(guard[key], true);
  assert.equal(guard.conversionAcceptance, false);
  assert.ok(BigInt(guard.protectedBirthLatest) < BigInt(guard.ownBirth));
  validateBirthOwnershipProofs({ birthFallbackQueries: 1, ownershipProofs: [guard.proof] });
  assert.equal(report.allocatedChildSamples, 6);
  const allocated = report.samples.filter(sample => sample.processes?.some(row => row.pid === report.descendantPid && row.privateBytes >= 40 * 1024 ** 2));
  assert.equal(allocated.length, 6);
  assert.ok(report.samples.some(sample => sample.sampleError && sample.privateBytes === null && sample.rssBytes === null && sample.processes === null));
  assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent")); assert.equal(report.cleanup.ownedScratchRemoved, true);
  assert.equal(report.cleanup.mediaCreated, false); assert.equal(report.cleanup.unrelatedApplicationsClosed, false);
  for (const [file, expected] of Object.entries(report.sources))
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), expected);
  assert.equal(makeBirthAwareMemoryObserver(source, helper).generatedSha256, report.generatedSourceSha256);
});

test("production browser gate now pins every observer source and retains birth proofs without changing the memory formula or baseline gate", async () => {
  const runtime = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(runtime, /from "\.\/lib\/birth-aware-chromium-memory.mjs"/);
  for (const file of ["birth-aware-chromium-memory.mjs", "birth-aware-memory-observer-source.mjs", "windows-tree-monitor.cs", "windows-process-birth-proof.cs", "windows-tree-monitor-birth-aware.ps1"])
    assert.ok(runtime.includes('"scripts/lib/' + file + '"'));
  assert.match(runtime, /report.memoryObserverOwnership = monitor.ownershipSummary\(\)/);
  assert.match(runtime, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(runtime, /assert.ok\(windows.length >= 2\)/);
});

test("first working-observer candidate run retains five genuine exact outputs but stays FAILED at251.0625MiB, not accepted optimization", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T09-11-56.851Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.memory.incrementalPrivateMiB, 251.0625);
  assert.equal(receipt.memory.validSamples, 506); assert.equal(receipt.memory.unavailableSamples, 0); assert.equal(receipt.sourcePins, 34);
  assert.equal(receipt.cases.length, 5);
  assert.ok(receipt.cases.every(row => row.status === "passed-small-private-fidelity-and-metadata-case" && row.disposableOutputRemoved
    && row.outputSha256 === "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3"));
  assert.equal(receipt.memoryObserverOwnership.generatedSourceSha256, makeBirthAwareMemoryObserver(source, helper).generatedSha256);
  assert.equal(receipt.memoryObserverOwnership.memoryFormulaChanged, false); assert.equal(receipt.memoryObserverOwnership.processNameOrSandboxExclusions, false);
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.artifact.core.allowedSourceEdits, 14);
  assert.ok(Object.values(report.cleanup).every(Boolean)); assert.equal(report.protectedOriginalUnchanged, true);
  assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const decoded = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(decoded), receipt.losslessJournal.sha256);
  const samples = decoded.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 506);
  for (const sample of samples) assert.equal(sample.privateBytes, sample.processes.reduce((total, process) => total + process.privateBytes, 0));
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
});

test("new allocation diagnostics separate validation/export without filtering it out of the primary process-tree gate", async () => {
  const runtime = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(runtime, /pageRealmOnlyNotWorkerOrProcessMemory: true/); assert.match(runtime, /noForcedGcOrArtificialCooldown: true/);
  assert.match(runtime, /Runtime.getHeapUsage/); assert.match(runtime, /-validation-export/); assert.match(runtime, /-independent-validation/);
  assert.match(runtime, /journal.peaksExcept\(\["blank"\]\)/);
  assert.doesNotMatch(runtime, /HeapProfiler.collectGarbage|Memory\.forciblyPurgeJavaScriptMemory/);
});
