import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { linkHevcAuxiliaryEmitter, reverseHevcAuxiliaryEmitterLinkage } from "../media/ffmpeg/mpeg2-hevc-auxiliary-linkage.mjs";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("HEVC linkage correction preserves historical header and adds only a directly callable native bridge", async () => {
  const header = await read("media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.h");
  const linked = linkHevcAuxiliaryEmitter(header);
  assert.equal(reverseHevcAuxiliaryEmitterLinkage(linked), header);
  assert.match(linked, /EM_JS\(void, within_hevc_aux_emit_js,/);
  assert.match(linked, /void within_hevc_aux_emit\(unsigned sequence/);
  assert.match(linked, /within_hevc_aux_emit_js\(sequence, layer, active/);
  assert.throws(() => linkHevcAuxiliaryEmitter(linked));
  assert.throws(() => reverseHevcAuxiliaryEmitterLinkage(linked.replace("output, values);", "output, NULL);")));
  assert.throws(() => linkHevcAuxiliaryEmitter(header.replace("liveEntries", "changedEntries")));
});
test("Actual failed build remains failed and cannot masquerade as browser/cache acceptance", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-hevc-auxiliary-link-build-failure-2026-10-06.json"));
  assert.equal(proof.run.databaseId, 37394428454); assert.equal(proof.run.conclusion, "failure");
  assert.equal(proof.run.buildSeconds, 265); assert.equal(proof.run.jobSeconds, 311);
  assert.match(proof.actualLinkerFailure, /undefined symbol: within_hevc_aux_emit/);
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/mpeg2-hevc-auxiliary-diagnostic.h")).digest("hex"), proof.originalHeaderSha256);
  assert.equal(proof.browserConversionAttempted, false); assert.equal(proof.compiledObserverVerified, false);
  assert.equal(proof.actualInactiveHevcBytesAtFailure, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.runnerBuildCleanupPassed, true);
});
