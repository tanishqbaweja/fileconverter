// Join all 79 native build preimages without duplicating them in browser snapshots.
// Both independent source envelopes retain the original 128-file/2MiB caps.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const PACKET_LARGEST_IDLE_NATIVE_ENVELOPE = "evidence/packet-largest-idle-native-sources-38327579000.json";
export async function verifyPacketLargestIdleNativeEnvelope(root, build, buildBytes, branch) {
  const read = file => readFile(path.join(root, file));
  const proofBytes = await read(PACKET_LARGEST_IDLE_NATIVE_ENVELOPE), proof = JSON.parse(proofBytes);
  assert.equal(proof.proof.path, "evidence/mpeg2-packet-largest-idle-build-38327579000.json");
  assert.equal(proof.proof.sha256, sha(buildBytes)); assert.equal(proof.executedHead, build.run.headSha);
  assert.equal(proof.allSourcesMatchedExecutedGitHead, true); assert.equal(proof.workflowCanonicalDiffOnly, true);
  assert.equal(proof.sourceCount, 79); assert.ok(proof.sourceCount <= 128);
  assert.deepEqual(proof.sourcePins, build.manifest.sources);
  assert.match(proof.archive.path, /^outputs\/reports\/packet-largest-idle-native-sources-38327579000\.json\.gz$/);
  const compressed = await read(proof.archive.path);
  assert.equal(compressed.length, proof.archive.bytes); assert.equal(sha(compressed), proof.archive.sha256);
  assert.ok(compressed.length <= 2097152);
  const restored = gunzipSync(compressed, { maxOutputLength: 2097152 });
  assert.equal(restored.length, proof.archive.restoredBytes); assert.equal(sha(restored), proof.archive.restoredSha256);
  const archive = JSON.parse(restored);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(archive.currentSourcePins, proof.currentSourcePins);
  assert.deepEqual(Object.keys(archive.sourcePreimages).sort(), Object.keys(proof.sourcePins).sort());
  assert.deepEqual(proof.postSourcePins, proof.currentSourcePins);
  const currentSourcePins = {};
  for (const [file, expected] of Object.entries(proof.sourcePins)) {
    assert.match(file, /^(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+$/);
    const preimage = archive.sourcePreimages[file]; assert.equal(preimage.encoding, "base64");
    const bytes = Buffer.from(preimage.data, "base64"); assert.ok(bytes.length <= 2097152);
    assert.equal(sha(bytes), expected, file);
    currentSourcePins[file] = sha(await read(file));
    if (file === branch.workflow.path) {
      assert.equal(expected, branch.workflow.generatedSha256); assert.equal(bytes.toString(), branch.workflow.generatedExactSource);
      assert.equal(currentSourcePins[file], branch.workflow.canonicalSha256);
    } else assert.equal(currentSourcePins[file], expected, file);
  }
  assert.deepEqual(currentSourcePins, proof.currentSourcePins);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  return { path: PACKET_LARGEST_IDLE_NATIVE_ENVELOPE, sha256: sha(proofBytes), sourceCount: 79,
    archive: proof.archive, currentSourcePins, allExecutedNativePreimagesVerified: true,
    unchanged128File2MiBEnvelopeCaps: true, publicAcceptance: false };
}
