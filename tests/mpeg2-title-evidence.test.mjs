import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { verifyEncoderPlaneTitleGoldenReport } from "../scripts/lib/encoder-plane-title-browser-recipe.mjs";

const read = file => readFileSync(file);
const json = file => JSON.parse(read(file));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = json("evidence/2026-10-11T00-04-25-682Z-encoder-plane-title-browser-goldens.json");
function archive(record) {
  const compressed = read(record.path);
  assert.equal(compressed.length, record.bytes);
  assert.equal(sha(compressed), record.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 2097152 });
  assert.equal(restored.length, record.restoredBytes);
  assert.equal(sha(restored), record.restoredSha256);
  return JSON.parse(restored);
}
const raw = archive(proof.report.archive);
const executed = archive(proof.generatedArchive);
const baseline = json("evidence/mpeg2-late-abort-goldens-2026-10-08.json").reports[0].report;
const buildBytes = read(proof.build.path);
assert.equal(sha(buildBytes), proof.build.sha256);
const build = JSON.parse(buildBytes);

test("actual five-case title evidence is archive-bound, bounded and not full acceptance", () => {
  assert.equal(proof.status, "five-headless-title-preservation-and-recovery-passed");
  assert.equal(proof.failure, null);
  assert.deepEqual(verifyEncoderPlaneTitleGoldenReport(raw, baseline, build), proof.analysis);
  for (const [file, content] of Object.entries(executed.sources))
    assert.equal(sha(Buffer.from(content)), executed.sourcePins[file], file);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.deepEqual(proof.protectedPre, proof.protectedPost);
  assert.equal(proof.cleanup.ownedWrapperAbsent, true);
  assert.equal(proof.cleanup.helpers.runtimeAbsent, true);
  assert.deepEqual(proof.cleanup.newFixtureDirsRemaining, []);
  for (const field of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance",
    "publicAcceptance", "conversionSpeedAcceptance"])
    assert.equal(proof[field], false, field);
  for (const token of ["Primary café — 音楽", "validateMatroskaMp4StreamTitle", "toBeGreaterThanOrEqual(0.98)",
    "sourceDecodedAudioHashes", "cancel-after-direct-output", "independent-pre-assertion-probes"])
    assert.ok(executed.generated.spec.includes(token), token);
});

test("title golden validation still rejects metadata, pixel, clock, audio, queue and cleanup regressions", () => {
  const conversion = report => report.rows.find(row => !row.kind && row.status === "passed");
  const row = (report, kind) => report.rows.find(item => item.kind === kind);
  for (const change of [
    report => row(report, "independent-pre-assertion-probes").outputProbe.streams.find(s =>
      s.codec_type === "video" && !s.disposition?.attached_pic).tags.name = "wrong",
    report => conversion(report).ssim = 0.1,
    report => conversion(report).sourceFrameTimes = [],
    report => row(report, "independent-decoded-audio").outputDecodedAudioHashes = ["wrong"],
    report => conversion(report).metrics.peakQueuedBytes = 524289,
    report => conversion(report).metrics.peakWasmMemoryBytes = 50331649,
    report => row(report, "direct-write-failure").partialBytes = [1],
    report => report.rows.find(item => "cleanupRemovedEntries" in item).cleanupRemovedEntries = ["leftover"],
  ]) {
    const bad = structuredClone(raw);
    change(bad);
    assert.throws(() => verifyEncoderPlaneTitleGoldenReport(bad, baseline, build));
  }
});
