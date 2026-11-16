import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const read = f => readFile(new URL(`../${f}`, import.meta.url)), sha = b => createHash("sha256").update(b).digest("hex");
test("actual48-loop control reproduces native raw24fps collision then preserves COMPLETE13824-frame pixels and PCM against independent streamhash", async () => {
  const bytes = await read("evidence/2026-11-16T01-23-38-047Z-decoded-timestamp-control.json");
  assert.equal(sha(bytes), "5ac325fd0a6908dfaff5ab9eef0ed098fd5330b788b2c097cbaa06ea336b8627");
  const r = JSON.parse(bytes), v = r.corrected.video, a = r.corrected.audio;
  assert.equal(r.status, "passed-reproduced-old-error-and-complete-corrected-hash-parity-not-large-browser-acceptance");
  assert.equal(r.fixture.loops, 48); assert.equal(r.fixture.bytes, 285228004);
  assert.equal(r.fixture.sha256, "ebfcddd6b6e4957d89b473e5221162d7cea8174ec3a38555d55e9ceb675994d0");
  assert.equal(r.oldRawMux.errors.length, 1); assert.match(r.oldRawMux.errors[0], /11840 >= 11840$/);
  assert.equal(r.oldRawMux.status, "reproduced-invalid-dts-no-acceptance"); assert.equal(r.oldRawMux.stdoutDiscarded, true);
  assert.equal(r.oracle.stderrEmpty, true); assert.equal(r.oracle.decodedFrames, 13824); assert.equal(v.decodedFrames, 13824);
  assert.equal(v.sha256, r.oracle.decodedVideoSha256); assert.equal(a.sha256, r.oracle.decodedPcmSha256);
  assert.equal(v.sha256, "69b6ba1a74eed11c3fe17b6a8074c62073db8c144da4a72d75d30293f0252e96");
  assert.equal(a.sha256, "a796036caeb1c81c0a65365fe8412cbc02624eea58069f964fca47762f0948a3");
  assert.equal(v.bytes, 19110297600); assert.equal(a.bytes, 55441408); assert.equal(v.duplicateFrames, 0); assert.equal(v.droppedFrames, 0);
  for (const d of [v, a]) {
    assert.equal(d.maximumChunkBytes, 65536); assert.equal(d.maximumRetainedDecodedChunks, 1);
    assert.equal(d.fullMediaBufferCreated, false); assert.equal(d.decodedFileCreated, false); assert.equal(d.nativeToolUsedForConversion, false);
  }
  assert.equal(r.runtimeRemoved, true); assert.deepEqual(r.failures, []);
  for (const field of ["nativeConversionUsed", "productionConverterChanged", "publicAcceptance", "originalFileAccessed"]) assert.equal(r[field], false);
  // Historical source pins are retained as evidence, not falsely assumed to
  // match arbitrarily later edited files; this exact correction has its hash.
  assert.equal(r.sourcePins["scripts/lib/streamed-decoded-hash.mjs"], "baaf168e636c3c7f36acdfb3e8ce05f51c9f7ffb888695498339ec8fb06252d1");
});
