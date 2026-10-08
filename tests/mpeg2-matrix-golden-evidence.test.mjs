import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofPath = "evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json";

test("new headed private matrix conversion goldens/decoded PCM/timelines/recovery remain exact", async () => {
  const bytes = await readFile(path.join(root, proofPath)); assert.ok(bytes.length < 32768);
  const p = JSON.parse(bytes); assert.equal(p.status, "passed-5-of-5-private-regression"); assert.equal(p.conversions.length, 3);
  for (const r of p.conversions) {
    const hevc = r.sourceCodec === "hevc";
    assert.equal(r.outputCodec, "mpeg2video"); assert.equal(r.frames, hevc ? "96" : "48");
    assert.equal(r.outputBytes, hevc ? 652521 : 321692); assert.equal(r.ssim, hevc ? .985963 : .992146);
    assert.equal(r.outputSha256, hevc ? "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32" : "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94");
    assert.equal(r.metrics.peakPendingOperations, 1); assert.equal(r.metrics.peakWasmMemoryBytes, 50331648);
  }
  assert.equal(p.nativeFullDecodePassed, true); assert.equal(p.audioChecks.length, 3);
  for (const r of p.audioChecks) assert.deepEqual(r.sourceDecodedAudioHashes, r.outputDecodedAudioHashes);
  assert.equal(p.recovery.length, 2); assert.ok(p.recovery.every(r => r.status === "passed" && r.partialBytes.length === 0));
  assert.equal(p.emptyCleanupInventories, 5); assert.equal(p.privateAdditionsAbsent, true);
  assert.equal(p.elapsedBrowserTestSeconds, null); assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.originalFullSourceAcceptance, false); assert.equal(p.publicAcceptance, false);
});

test("actual real-output UI and six reviewed screenshot hashes retained; labels cannot certify private codec", async () => {
  const p = JSON.parse(await readFile(path.join(root, proofPath)));
  assert.deepEqual(p.matrixUiObservations.map(r => r.jobState), ["complete", "complete", "complete", "error", "running", "cancelled"]);
  assert.ok(p.matrixUiObservations[4].outputBytes > 32768);
  assert.ok(p.matrixUiObservations.every(r => r.matrixCards === 405 && !r.overflow && r.allInspectedGeometryPositive));
  assert.equal(p.visualReview.reviewedScreenshots.length, 6); assert.match(p.visualReview.caveat, /labels public MPEG4\/remux/);
  for (const r of p.visualReview.reviewedScreenshots) {
    const bytes = await readFile(path.join(root, r.path)); assert.equal(bytes.length, r.bytes); assert.equal(sha(bytes), r.sha256);
  }
  assert.equal(p.independentCleanup.observedPidCount, 25); assert.equal(p.independentCleanup.allObservedPidsAbsent, true);
  assert.equal(p.independentCleanup.nativeBirthsUnavailable, true);
  for (const [file, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  const envelopeBytes = await readFile(path.join(root, p.executionEnvelope.path)); assert.equal(sha(envelopeBytes), p.executionEnvelope.sha256);
  const e = JSON.parse(envelopeBytes); assert.deepEqual(e.sourcePins, e.postSourcePins);
  for (const [name, source] of Object.entries(e.generatedSources)) assert.equal(sha(source), e.generatedHashes[name]);
  await assert.rejects(access(e.ownedWrapper), { code: "ENOENT" });
  const record = e.reports[0], raw = await readFile(path.join(root, record.path)); assert.equal(raw.length, record.bytes); assert.equal(sha(raw), record.sha256);
});

test("compact freeze fixes report assembly only, preserving failed source and unchanged32KiB cap", async () => {
  const failed = JSON.parse(await readFile(path.join(root, "evidence/mpeg2-matrix-golden-freeze-size-failure-2026-10-08.json")));
  assert.equal(failed.status, "failed-independent-freeze-summary-size-cap");
  for (const [file, hash] of Object.entries(failed.sourcePins)) assert.equal(sha(await readFile(path.join(root, file))), hash, file);
  await assert.rejects(access(failed.ownedFreezeDirectory), { code: "ENOENT" });
  assert.equal(failed.conversionRepeated, false); assert.equal(failed.summaryCapChanged, false);
  const compact = await readFile(path.join(root, "scripts/freeze-mpeg2-matrix-goldens-compact.mjs"), "utf8");
  assert.ok(compact.includes('matrixUiObservations:${JSON.stringify(ui.map('));
  assert.ok(compact.includes('32KiB output cap unchanged'));
});
