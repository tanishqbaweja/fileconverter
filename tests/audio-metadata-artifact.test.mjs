import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyAudioMetadataCore, validateAudioMetadataArtifactName } from "../scripts/lib/audio-metadata-artifact.mjs";
import { makeAudioTextMetadataCandidate } from "../media/ffmpeg/audio-text-metadata-candidate.mjs";
const sha = text => createHash("sha256").update(text).digest("hex");
const parent = await readFile("media/ffmpeg/within_remux.c", "utf8"), helper = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
const candidate = makeAudioTextMetadataCandidate(parent, helper), publicManifest = JSON.parse(await readFile("public/engines/remux/build-manifest.json"));
const limits = [{ imported: true, initialPages: 512, maximumPages: 1536, shared: true }];
function fixture() {
  return { parent, helper, compiled: candidate.generated, publicManifest,
    memoryLimits: structuredClone(limits), publicMemoryLimits: structuredClone(limits),
    manifest: { ...structuredClone(publicManifest), engine: "within-remux-private-bounded-audio-metadata",
      modules: [structuredClone(publicManifest.modules.find(core => core.name === "within-remux"))],
      candidate: { codecSettingsChanged: false, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false,
        allowedSourceEdits: 3, originalMasterSha256: candidate.parentSha256, parentSha256: candidate.parentSha256,
        helperSha256: candidate.helperSha256, compiledSourceSha256: candidate.generatedSha256, wasmMemoryLimits: structuredClone(limits) } } };
}
test("artifact audit accepts actual checked metadata derivation, not a codec/browser/memory acceptance claim", () => {
  const result = verifyAudioMetadataCore(fixture()); assert.equal(result.publicAcceptance, false);
  assert.equal(result.allowedSourceEdits, 3); assert.deepEqual(result.memoryLimits, limits);
});
test("artifact audit rejects changed code even with re-signed hashes, increased heaps, thread/codec/I/O changes or false promotion flags", () => {
  for (const change of [
    f => { f.compiled += "\nint unrelated_change;\n"; f.manifest.candidate.compiledSourceSha256 = sha(f.compiled); },
    f => { f.memoryLimits[0].maximumPages++; }, f => { f.manifest.candidate.memoryLimitsRaised = true; },
    f => { f.manifest.candidate.browserFixVerified = true; }, f => { f.manifest.candidate.allowedSourceEdits = 2; },
    f => { f.manifest.modules[0].videoCodecThreads++; }, f => { f.manifest.modules[0].wasmPthreadPoolSize++; },
    f => { f.manifest.audioFifoMaximumQueuedSamples++; }, f => { f.manifest.avioOutputBufferBytes++; },
    f => { f.manifest.ffmpegVersion = "other"; }, f => { f.manifest.candidate.helperSha256 = "0".repeat(64); },
  ]) { const f = fixture(); change(f); assert.throws(() => verifyAudioMetadataCore(f)); }
});
test("flat artifact names accept emitted multi-dot C preimages and reject traversal, foreign media and hidden paths", () => {
  for (const file of ["within-remux.mjs", "within-remux.wasm", "within_remux.metadata.c", "within_remux.parent.c", "build-manifest.json", "LICENSE.lame-linking"]) validateAudioMetadataArtifactName(file);
  for (const file of ["../test.mkv", "folder/file.c", "folder\\file.c", ".hidden.c", "source.opus", "H:\\outside.wasm"]) assert.throws(() => validateAudioMetadataArtifactName(file));
});
test("private browser harness keeps exact baseline hashes, real source assertions and independent owned cleanup", async () => {
  const source = await readFile("tests/browser/audio-expanded-metadata.spec.ts", "utf8"), runner = await readFile("scripts/test-audio-metadata-candidate.mjs", "utf8");
  assert.match(source, /candidate.fixtures\[conversion.source\].sha256/); assert.match(source, /candidate.deliveredArtifacts\[file\]/);
  assert.match(source, /expect\(outputTags.status, JSON.stringify\(outputTags\)\).toBe\("passed"\)/);
  assert.match(source, /case-leases.jsonl/); assert.match(source, /passed-private-candidate-metadata-check/);
  assert.match(runner, /assert.deepEqual\(await queryProcessIdentity\(server.pid\), serverIdentity\)/);
  assert.match(runner, /current.ino.toString\(\), row.identity.ino/); assert.match(runner, /cleanupCaseLeases/);
  assert.match(runner, /memory.incrementalPrivateMiB <= 250/); assert.match(runner, /publicFilesNeverWritten: true/);
});
