import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-cache-layered-source-archive.mjs";
import { baselineBinding } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = name => readFile(path.join(root, name));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/2026-10-12T05-53-16-380Z-packet-cache-original-full-interruption-recovery.json"));

test("interruption preserves genuine but incomplete output inspection, never invents acceptance or missing native peaks", () => {
  assert.equal(proof.failure, null); assert.equal(proof.status, "interrupted-full-run-owned-recovery-complete-not-conversion-acceptance");
  assert.equal(proof.partial.bytes, 1532758257); assert.equal(proof.partial.nativeProbe.streams[0].codec_name, "mpeg2video");
  assert.equal(Number(proof.partial.nativeProbe.format.duration), 3352.276);
  assert.ok(Number(proof.partial.nativeProbe.format.duration) < proof.partial.completeOriginalDurationSeconds);
  for (const field of ["nativeMemoryAcceptance", "fidelityAcceptance", "fullOriginalAcceptance", "publicAcceptance", "originalRunTerminalReportAvailable"])
    assert.equal(proof[field], false, field);
  assert.equal(proof.reconstructedNativePeak, null); assert.equal(proof.stableBlankBaseline, null);
  assert.equal(proof.knownCauseOfInterruption, null); assert.equal(proof.noProcessesKilled, true);
  assert.equal(proof.completedValidatedConversions, 0); assert.equal(proof.noAutomaticRelaunch, true);
  assert.deepEqual(proof.originalPre, proof.originalPost);
  assert.equal(proof.originalPost.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
});

test("recovery restores stock assets and removes only five exact repository-owned targets", async () => {
  assert.equal(proof.productionRestored, true); assert.equal(proof.recoveryRuntimeRemoved, true);
  assert.equal(proof.deletedDirectories.length, 5);
  assert.deepEqual(proof.processPre.matched, []); assert.deepEqual(proof.processPost.matched, []);
  for (const file of proof.deletedDirectories) {
    assert.equal(path.dirname(file), path.join(root, "work"));
    await assert.rejects(access(file), { code: "ENOENT" });
  }
  assert.equal(sha(await read("dist/client" + baselineBinding.url)), baselineBinding.sha256);
  assert.equal(proof.partial.convertedCopyRetained, false);
});

test("retained compact log and recovery own preimage are byte-exact, all333 original executed sources still join", async () => {
  const log = await read(proof.retainedLog.path);
  assert.equal(log.length, proof.retainedLog.bytes); assert.equal(sha(log), proof.retainedLog.sha256);
  const restored = gunzipSync(log); assert.equal(restored.length, proof.retainedLog.restoredBytes);
  assert.equal(sha(restored), proof.retainedLog.restoredSha256);
  const own = await read(proof.ownSource.path);
  assert.equal(sha(own), proof.ownSource.sha256); assert.deepEqual(Buffer.from(proof.ownSource.preimage, "base64"), own);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePreimages).length, 333);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(archive.sourcePins, proof.postSourcePins);
});
