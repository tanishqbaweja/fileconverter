import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectLargestIdleMediaReport } from "../scripts/lib/packet-largest-idle-media-recipe.mjs";
import { inspectInputReadMediaReport } from "../scripts/lib/input-read-media-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-13-largest-idle-browser-qualification-and-timing-pair.json"));
async function restore(record, limit) {
  const compressed = await read(record.path); assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const bytes = gunzipSync(compressed, { maxOutputLength: limit }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return bytes;
}
test("actual changed7bb native control joins83 current/pre/post/preimage sources, typed packet function and bounded no-payload abort slots", async () => {
  const bytes = await read(proof.control.path); assert.equal(sha(bytes), proof.control.sha256);
  const control = JSON.parse(bytes); assert.equal(control.status, "passed-synthetic-abort-control");
  const receipt = JSON.parse(await read("evidence/2026-10-13T00-53-07-022Z-packet-largest-idle-abort-control-executed-sources.json"));
  const archive = JSON.parse(await restore(receipt.archive, 2097152)); assert.equal(Object.keys(receipt.sourcePins).length, 83);
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  }
  assert.equal(receipt.layout.nativeSourceEnvelope.sourceCount, 79);
  assert.equal(receipt.layout.functions.find(row => row.name === "mpeg2_packets").functionIndex, 4471);
  const row = control.result.terminal.emitted;
  assert.equal(row.failedIndividualAllocationBytes, 33554432); assert.equal(row.qualifiedDirectBufferCallPath, true);
  assert.equal(row.qualifiedPacketCallPath, false); assert.equal(row.qualifiedPoolCallPath, false);
  assert.equal(row.validatedScalarWords, 16); assert.equal(row.noNativeCallsAtAbort, true); assert.equal(row.noPayloadRead, true);
  assert.equal(row.allocatorFreeBlocks.complete, true); assert.equal(row.allocatorFreeBlocks.payloadRead, false);
  assert.equal(receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(receipt.ownedCaller), { code: "ENOENT" });
});
test("actual candidate210 and baseline162 sources join; each has four genuine independently validated identical outputs and recovery", async () => {
  assert.deepEqual(proof.records.map(row => row.sourceCount), [210, 162]);
  for (const [index, record] of proof.records.entries()) {
    const receiptBytes = await read(record.receipt.path); assert.equal(sha(receiptBytes), record.receipt.sha256);
    const receipt = JSON.parse(receiptBytes), archive = JSON.parse(await restore(record.sourceArchive, 8388608));
    assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.deepEqual(archive.sourcePins, receipt.sourcePins);
    for (const [file, hash] of Object.entries(receipt.sourcePins)) { assert.equal(sha(archive.sources[file]), hash); assert.equal(sha(await read(file)), hash, file); }
    const raw = JSON.parse(await restore(record.reportArchive, 2097152));
    const baseline = JSON.parse(await read(receipt.baseline.path)).reports[0].report, build = JSON.parse(await read(receipt.build.path));
    const analysis = (index ? inspectInputReadMediaReport : inspectLargestIdleMediaReport)(raw, baseline, build);
    assert.deepEqual(analysis, receipt.analysis); assert.equal(analysis.genuineValidatedConversions, 4);
    const outputs = raw.rows.filter(row => row.kind === "independent-pre-assertion-probes"); assert.equal(outputs.length, 4);
    for (const output of outputs) {
      assert.equal(output.outputBytes, 2245558);
      assert.equal(output.outputSha256, "554cc84159d2e36f4fd2adb060062cf78be02d4195f7857ceefe0953065c5f27");
    }
    assert.equal(receipt.protectedPre.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
    assert.deepEqual(receipt.protectedPre, receipt.protectedPost); assert.equal(receipt.protectedPost.bytes, 2958573265);
    await assert.rejects(access(receipt.report.path), { code: "ENOENT" }); await assert.rejects(access(receipt.cleanup.ownedWrapper), { code: "ENOENT" });
  }
});
test("fresh matched timing pair is mixed and not a claimed speedup, full conversion, memory acceptance or reproduced packet abort", () => {
  assert.deepEqual(proof.cases.map(row => row.phase), ["normal", "write-recovery", "cancel-recovery", "read-recovery"]);
  assert.deepEqual(proof.cases.map(row => row.candidateElapsedMs < row.baselineElapsedMs), [true, true, false, false]);
  for (const row of proof.cases) {
    assert.equal(row.candidateOverBaseline, row.candidateElapsedMs / row.baselineElapsedMs);
    assert.equal(row.frames, 96); assert.equal(row.ordinalSsim, 0.983095);
    assert.equal(row.inputSha256, "6de34df2f96e8cce3318f21893d07a395b31a6968d680bd40484f6e8771a5dcb");
  }
  for (const key of ["speedGainProven", "completeChromiumMemoryAcceptance", "actualPacketMallocFailureReproduced", "originalFullConversionAcceptance", "publicAcceptance"]) assert.equal(proof[key], false);
  assert.equal(proof.peakIncrementalPrivateMiB, null); assert.match(proof.benchmarkDesign, /Not randomized/);
});
test("independent15 owned births absent, two raw reports removed only after lossless archives, whole protected SHA and verifier source retained", async () => {
  assert.equal(proof.ownedBirthExitChecks.length, 15); assert.ok(proof.ownedBirthExitChecks.every(row => row.ownedBirthAbsent));
  assert.equal(proof.removedRedundantRawJsonBytes, 1950579); assert.equal(proof.losslessRawArchivesRetained, true);
  assert.equal(proof.protectedOriginalWholeSha256Verified, true); assert.equal(proof.noProcessesKilled, true);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
