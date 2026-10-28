import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { readPreImageSizePatch } from "./helpers/pre-image-size-patch.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
test("snapshot-option control stays failed and discloses the actual missing HAR rather than treating diagnostic evidence as accepted", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-27-svg-snapshot-control-terminal.json")), raw = await readFile(new URL("../" + proof.rawReport, import.meta.url));
  assert.equal(raw.length, proof.rawReportBytes); assert.equal(sha(raw), proof.rawReportSha256);
  const row = JSON.parse(raw); assert.equal(row.stats.expected, 10); assert.equal(row.stats.unexpected, 0);
  assert.equal(row.memory.incrementalPrivateMiB, 273.17578125); assert.ok(row.memory.incrementalPrivateMiB > 250);
  assert.equal(proof.actualTraceNetworkBytes, 0); assert.equal(proof.initialClaimThatDetailedNetworkRecordingWouldRemainWasWrong, true);
  assert.equal(proof.acceptanceMetric, false); assert.equal(proof.diagnosticPerturbsMemory, true);
  assert.deepEqual(row.forbiddenRequests, []); assert.equal(row.wasmRequests, 4);
  const archive = JSON.parse(await read(proof.sourceArchive)); assert.equal(archive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    const old = archive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await readPreImageSizePatch(file);
    assert.equal(sha(bytes), digest, file);
  }
});
test("real allocator diagnostic preserves its strict memory failure, counter archives, unavailable heaps and executed sources", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-27-svg-allocator-terminal.json")), raw = await readFile(new URL("../" + proof.rawReport, import.meta.url));
  assert.equal(raw.length, proof.rawReportBytes); assert.equal(sha(raw), proof.rawReportSha256);
  const row = JSON.parse(raw); assert.deepEqual([row.stats.expected, row.stats.unexpected, row.stats.skipped], [10, 0, 0]);
  assert.equal(row.memory.incrementalPrivateMiB, 297.49609375); assert.ok(row.memory.incrementalPrivateMiB > 250);
  assert.equal(row.memory.diagnosticPerturbed, true); assert.equal(row.memoryAcceptance, false);
  assert.equal(row.allocatorCaptures.length, 3); assert.deepEqual(row.allocatorErrors, []);
  assert.deepEqual(proof.workerHeapSamples, { available: 11, unavailable: 22, unavailableIsNullNotZero: true });
  for (const capture of row.allocatorCaptures) {
    assert.equal(capture.result.acceptanceMetric, false); assert.equal(capture.result.perturbsMemory, true);
    const archive = capture.result.archive, zipped = await readFile(new URL("../" + archive.path.replaceAll("\\", "/"), import.meta.url));
    assert.equal(zipped.length, archive.bytes); assert.equal(sha(zipped), archive.sha256);
    const trace = gunzipSync(zipped, { maxOutputLength: 8388608 });
    assert.equal(trace.length, archive.restoredBytes); assert.equal(sha(trace), archive.restoredSha256);
  }
  const sourceArchive = JSON.parse(await read(proof.sourceArchive)); assert.equal(sourceArchive.sourceCommit, row.executedHead);
  for (const [file, digest] of Object.entries(row.sourcePins)) {
    const old = sourceArchive.files[file]; let bytes;
    if (old) { bytes = gunzipSync(Buffer.from(old.gzipBase64, "base64"), { maxOutputLength: 32768 }); assert.equal(bytes.length, old.bytes); assert.equal(sha(bytes), old.sha256); }
    else bytes = await readPreImageSizePatch(file);
    assert.equal(sha(bytes), digest, file);
  }
  assert.equal(row.ownedRuntimeRemoved, true); assert.ok(row.processCleanup.every(value => value.status === "owned-identity-absent"));
  assert.deepEqual(row.protectedOriginalAfter, row.protectedOriginalBefore);
});
test("SVG allocation mode is explicit, bounded, non-accepting and keeps full-tree/quality/cleanup gates", async () => {
  const source = await read("scripts/test-source-built-svg-candidate.mjs");
  assert.match(source, /process.argv\[2\] === "--allocator-diagnostic"/);
  assert.match(source, /process.argv\[2\] === "--allocator-diagnostic-no-dom-snapshots"/);
  assert.match(source, /allocationDiagnostic = .* \|\| noDomSnapshotDiagnostic/);
  assert.match(source, /screenshots: true, snapshots: !noDomSnapshotDiagnostic, sources: false/);
  assert.match(source, /domSnapshotRecording: !noDomSnapshotDiagnostic, screenshotRecording: true/);
  assert.match(source, /networkHarRecording: !noDomSnapshotDiagnostic, networkPolicyAssertionsRetained: true/);
  assert.match(source, /process.argv.length === 2 \|\| \(process.argv.length === 3 && allocationDiagnostic\)/);
  assert.match(source, /diagnosticPerturbsMemory: allocationDiagnostic/); assert.match(source, /memoryAcceptance: false/);
  assert.match(source, /report.allocatorCaptures.length < 3/); assert.match(source, /}, 12000\)/);
  for (const phase of ["blank-after-baseline", "scheduled-late-suite", "post-suite"])
    assert.ok(source.includes(`captureAllocators("${phase}")`));
  assert.doesNotMatch(source, /during:|collectGarbage|forceGC|--disable-/);
  assert.match(source, /connectPlaywrightRealmSampler\(browser, origin\)/);
  assert.match(source, /runnerStillLiveAtRequest: Boolean\(runner && runner.exitCode === null\)/);
  assert.match(source, /startTime: value.startTime/);
  assert.ok(source.indexOf('observer.setPhase("post-suite-diagnostic")') > source.indexOf("report.memory.incrementalPrivateMiB ="));
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250/);
  assert.match(source, /completed-private-svg-allocation-diagnostic-not-memory-acceptance/);
  assert.match(source, /clearTimeout\(allocatorTimer\); await pending; await allocatorPending/);
  assert.match(source, /stats.expected, 10/); assert.match(source, /stats.skipped, 0/);
});
test("allocator traces use the existing exact-byte bounded helper and never replace the protected browser conversion pipeline", async () => {
  const source = await read("scripts/test-source-built-svg-candidate.mjs");
  assert.match(source, /captureLiveMemoryInfra\(\{ session: await browser.newBrowserCDPSession\(\)/);
  assert.match(source, /sampleChromiumTree\(chrome.pid\)/);
  assert.match(source, /path.join\(root, "output\/playwright",/);
  assert.match(source, /requireExplicitWasmMaximum\(report.wasmMemory, pins.experimentalMaximumBytes\)/);
  assert.match(source, /"tests\/browser\/image-conversions.spec.ts", "--grep", "svg-to-png\|SVG"/);
  assert.match(source, /protectedOriginalAfter = await originalIdentity\(\)/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/); assert.match(source, /await runtime\?\.close\(\)/);
});
