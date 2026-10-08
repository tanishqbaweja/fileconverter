import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
const root = path.resolve(import.meta.dirname, ".."), sha = b => createHash("sha256").update(b).digest("hex");
const file = "evidence/2026-10-08T11-43-06-973Z-mpeg2-hero-width-golden-validation.json";

test("actual hero-width headed suite preserves exact genuine MPEG2 goldens, PCM, fidelity and recovery", async () => {
  const bytes = await readFile(path.join(root, file)); assert.ok(bytes.length < 32768);
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
  assert.equal(p.elapsedBrowserTestSeconds, null); assert.equal(p.completeChromiumMemoryAcceptance, false);
  assert.equal(p.originalFullSourceAcceptance, false); assert.equal(p.publicAcceptance, false);
});

test("six actually reviewed screenshots and executed new CSS source pins survive independent freeze", async () => {
  const p = JSON.parse(await readFile(path.join(root, file)));
  assert.deepEqual(p.matrixUiObservations.map(r => r.jobState), ["complete", "complete", "complete", "error", "running", "cancelled"]);
  assert.equal(p.matrixUiObservations[4].outputBytes, 232344);
  assert.ok(p.matrixUiObservations.every(r => r.matrixCards === 405 && !r.overflow && r.allInspectedGeometryPositive));
  assert.equal(p.visualReview.reviewedScreenshots.length, 6); assert.match(p.visualReview.caveat, /labels public MPEG4\/remux/);
  for (const r of p.visualReview.reviewedScreenshots) {
    const b = await readFile(path.join(root, r.path)); assert.equal(b.length, r.bytes); assert.equal(sha(b), r.sha256);
  }
  assert.equal(p.independentCleanup.observedPidCount, 25); assert.equal(p.independentCleanup.allObservedPidsAbsent, true);
  assert.equal(p.independentCleanup.nativeBirthsUnavailable, true);
  for (const [f, hash] of Object.entries(p.sourcePins)) assert.equal(sha(await readFile(path.join(root, f))), hash, f);
  const envelopeBytes = await readFile(path.join(root, p.executionEnvelope.path)); assert.equal(sha(envelopeBytes), p.executionEnvelope.sha256);
  const e = JSON.parse(envelopeBytes); assert.deepEqual(e.sourcePins, e.postSourcePins);
  assert.ok(e.generatedSources.spec.includes('.hero-copy{flex:0 1 auto'));
  assert.ok(e.generatedSources.spec.includes('".hero", ".hero-copy", ".converter-card"'));
  for (const [name, source] of Object.entries(e.generatedSources)) assert.equal(sha(source), e.generatedHashes[name]);
  await assert.rejects(access(e.ownedWrapper), { code: "ENOENT" });
  const r = e.reports[0], raw = await readFile(path.join(root, r.path)); assert.equal(raw.length, r.bytes); assert.equal(sha(raw), r.sha256);
});
