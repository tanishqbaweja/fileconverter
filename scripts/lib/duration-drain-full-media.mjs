// Read-only replay of actual small-media qualification; never executes cleanup.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { assertInstalledChromePinsEqual, inspectInstalledChromePin } from "./installed-chrome-pin.mjs";
import { ebmlMediaParts, inspectEbmlMediaReport } from "./duration-drain-media-recipe.mjs";
import { verifyDurationEquivalenceReports } from "./duration-drain-equivalence.mjs";
export const DURATION_MEDIA = "evidence/2026-10-15T10-41-15-440Z-duration-drain-media.json";
export const DURATION_SEAL = "evidence/2026-10-15T10-41-15-440Z-duration-drain-independent-qualification.json";
export const DURATION_SUPPLEMENT = "evidence/2026-10-15T10-41-15-429Z-duration-drain-media-supplement.json";
export async function loadQualifiedDurationMedia(root) {
  const parts = await ebmlMediaParts(root), read = file => readFile(path.join(root, file));
  const mediaBytes = await read(DURATION_MEDIA), proof = JSON.parse(mediaBytes), sealBytes = await read(DURATION_SEAL), seal = JSON.parse(sealBytes);
  assert.equal(sha(mediaBytes), seal.media.sha256); assert.equal(seal.media.path, DURATION_MEDIA);
  assert.equal(proof.failure, null); assert.equal(proof.analysis.genuineValidatedConversions, 4);
  assert.equal(seal.smallFixtureFidelityQualified, true); assert.equal(seal.fullOriginalAcceptance, false);
  const restore = async (record, maximum) => {
    const zip = await read(record.path); assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
    const raw = gunzipSync(zip, { maxOutputLength: maximum }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
    return JSON.parse(raw);
  };
  const archive = await restore(proof.generatedArchive, 8388608), report = await restore(proof.report.archive, 2097152);
  assert.deepEqual(report.manifest, archive.generated.composition.manifest);
  const supplementBytes = await read(DURATION_SUPPLEMENT), supplement = JSON.parse(supplementBytes);
  assert.equal(sha(supplementBytes), seal.supplemental.sha256); assert.equal(seal.supplemental.path, DURATION_SUPPLEMENT);
  assert.equal(supplement.failure, null); const extra = await restore(supplement.archive, 2097152);
  for (const [receipt, preimages, count, encoding] of [[proof, archive.sources, 255, "text"], [supplement, extra.preimages, 83, "base64"]]) {
    assert.equal(Object.keys(receipt.sourcePins).length, count); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
    for (const [file, hash] of Object.entries(receipt.sourcePins)) {
      assert.equal(sha(encoding === "text" ? preimages[file] : Buffer.from(preimages[file], "base64")), hash, file);
      assert.equal(sha(await read(file)), hash, file);
    }
  }
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(extra.sourcePins, supplement.sourcePins);
  const baselineBytes = await read(proof.baseline.path), buildBytes = await read(proof.build.path);
  assert.equal(sha(baselineBytes), proof.baseline.sha256); assert.equal(sha(buildBytes), proof.build.sha256);
  assert.deepEqual(await inspectEbmlMediaReport(report, JSON.parse(baselineBytes).reports[0].report, JSON.parse(buildBytes)), proof.analysis);
  const pairBytes = await read(seal.baseline.path); assert.equal(sha(pairBytes), seal.baseline.sha256);
  const baseline = await restore(JSON.parse(pairBytes).report.archive, 2097152);
  assert.deepEqual(verifyDurationEquivalenceReports(baseline, report), seal.equivalence);
  assert.equal(seal.equivalence.exactPacketPayloadAndTimingPreservation, true);
  assert.equal(seal.equivalence.allStreamChapterAndUserMetadataMatch, true);
  assert.equal(seal.equivalence.allEightCurrentOutputsRepeatable, true);
  assert.equal(seal.equivalence.qualityOrTimingThresholdRelaxed, false);
  for (const [file, source] of Object.entries(seal.ownSources)) {
    assert.equal(sha(Buffer.from(source.preimage, "base64")), source.sha256); assert.equal(sha(await read(file)), source.sha256, file);
  }
  assert.deepEqual(archive.generated.ebmlNativeEnvelope, parts.native.envelope);
  assert.equal(archive.generated.actualEbmlControlWitness, parts.controlPath);
  assertInstalledChromePinsEqual(proof.browserPinBefore, proof.browserPinAfter);
  assertInstalledChromePinsEqual(proof.browserPinBefore, parts.control.browserPinBefore);
  assertInstalledChromePinsEqual(proof.browserPinBefore, seal.browserPin);
  assertInstalledChromePinsEqual(proof.browserPinBefore, await inspectInstalledChromePin());
  const stage = archive.generated.stage, start = stage.indexOf("const adapter = "), end = stage.indexOf(";\nconst replacing = ", start);
  assert.ok(start > 0 && end > start); const adapter = JSON.parse(stage.slice(start + "const adapter = ".length, end));
  const stack = ["__wrap_av_realloc", "emscripten_builtin_realloc", "emscripten_builtin_malloc", "sbrk"].map(name => {
    const matches = parts.native.functions.filter(row => row.name === name); assert.equal(matches.length, 1); return matches[0].functionIndex;
  });
  for (const token of [parts.native.proof.decoder.sha256, JSON.stringify(stack), "originalBridge.read(offset, destination)", "withinAsyncifyStorageClose"])
    assert.ok(adapter.includes(token), token);
  assert.equal(parts.native.envelope.sourceCount, 126);
  return { proof, archive, report, pin: proof.browserPinBefore, adapter: { bytes: Buffer.byteLength(adapter), sha256: sha(adapter) },
    allSourcePins: { ...proof.sourcePins, ...supplement.sourcePins }, parts, supplementPath: DURATION_SUPPLEMENT, supplement,
    additionalEvidence: [seal.baseline.path, JSON.parse(pairBytes).report.archive.path, ...Object.keys(seal.ownSources)],
    reference: { path: DURATION_MEDIA, sha256: sha(mediaBytes), sourceCount: 338,
      independentSeal: { path: DURATION_SEAL, sha256: sha(sealBytes) }, supplemental: { path: DURATION_SUPPLEMENT, sha256: sha(supplementBytes) },
      runtimeVersion: proof.browserPinBefore.version, nativeAllocationPolicyChanged: true,
      exactPacketPayloadTimingAndMetadataEquivalent: true, historicalWholeContainerByteIdentity: false,
      encodingIoQualityAndMemoryGatesUnchanged: true } };
}
