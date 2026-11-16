import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = b => createHash("sha256").update(b).digest("hex");
test("actual12s paired native-validator comparison preserves ALL pixels/PCM and bounded chunks; no browser or multiGB speed claim", async () => {
  const bytes = await readFile("evidence/2026-11-16T00-49-46-286Z-decoded-stream-hash-benchmark.json");
  assert.equal(sha(bytes), "590598f7a95003a9fb6611b96bf94fc88f5ec99af21c8b552a8fa79f5325f12a");
  const r = JSON.parse(bytes); assert.equal(r.samples.length, 3); assert.equal(r.result.legacyMeanMs, 1058);
  assert.equal(r.result.candidateMeanMs, 597.3333333333334); assert.equal(r.result.largeFileSpeedupProven, false);
  for (const s of r.samples) {
    assert.equal(s.legacy.decodedVideoSha256, s.candidate.video.sha256); assert.equal(s.legacy.decodedPcmSha256, s.candidate.audio.sha256);
    assert.equal(s.candidate.video.decodedFrames, 288); assert.equal(s.candidate.video.bytes, 398131200);
    assert.equal(s.candidate.audio.bytes, 1153024); assert.equal(s.candidate.video.maximumChunkBytes, 65536);
  }
  assert.ok(r.runtimeRemoved); assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false);
});
test("actual real119MB/20-loop benchmark matches5760frames and every decoded PCM byte in all3 pairs; faster inspection is not converter speedup", async () => {
  const bytes = await readFile("evidence/2026-11-16T00-54-05-296Z-decoded-stream-hash-benchmark.json");
  assert.equal(sha(bytes), "e9c5dbaa181907f9eb8bfd5dd75b512519c3285c86308099dc202ad61ea207d7");
  const r = JSON.parse(bytes); assert.equal(r.fixture.bytes, 118846768); assert.equal(r.fixture.expectedFrames, 5760);
  assert.equal(r.fixture.sha256, "4d61f089eead55a4e36957f2558f6898dfe7059826a23bf39d5fbf70d67d191c");
  assert.equal(r.result.legacyMeanMs, 30114.666666666668); assert.equal(r.result.candidateMeanMs, 12316.333333333334);
  assert.equal(r.result.relativeSpeed, 2.4451000027064334); assert.equal(r.samples.length, 3);
  for (const s of r.samples) {
    assert.equal(s.legacy.decodedVideoSha256, s.candidate.video.sha256); assert.equal(s.legacy.decodedPcmSha256, s.candidate.audio.sha256);
    assert.equal(s.candidate.video.decodedFrames, 5760); assert.equal(s.candidate.video.bytes, 7962624000);
    assert.equal(s.candidate.audio.bytes, (20 * 564 * 1024 - 1024) * 2);
    assert.equal(s.candidate.video.maximumChunkBytes, 65536); assert.equal(s.candidate.audio.maximumChunkBytes, 65536);
    assert.equal(s.candidate.video.decodedFileCreated, false); assert.equal(s.candidate.audio.decodedFileCreated, false);
  }
  assert.deepEqual(r.samples.map(s => s.order), [["legacy", "candidate"], ["candidate", "legacy"], ["legacy", "candidate"]]);
  assert.ok(r.runtimeRemoved && r.result.exactVideoAndPcmHashesMatchEveryPair);
  assert.equal(r.result.largeFileSpeedupProven, false); assert.equal(r.result.productionConverterChanged, false);
  assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false); assert.equal(r.originalFileAccessed, false);
});
