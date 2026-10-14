// Qualified independent86-source native envelope; no public/browser acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export async function verifyReallocNativeEnvelope(root, build, buildBytes, branch) {
  const runId = String(build.run.databaseId); assert.match(runId, /^[0-9]{8,}$/);
  assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success"); assert.equal(build.run.headSha, branch.commit);
  const read = file => readFile(path.join(root, file)), file = `evidence/realloc-native-sources-${runId}.json`, proofBytes = await read(file), proof = JSON.parse(proofBytes);
  assert.equal(proof.proof.path, `evidence/mpeg2-realloc-attempt-build-${runId}.json`); assert.equal(proof.proof.sha256, sha(buildBytes));
  assert.equal(proof.executedHead, build.run.headSha); assert.equal(proof.sourceCount, 86); assert.ok(proof.sourceCount <= 128);
  assert.equal(proof.allSourcesMatchedExecutedGitHead, true); assert.equal(proof.workflowCanonicalDiffOnly, true);
  assert.deepEqual(proof.sourcePins, build.manifest.sources); assert.deepEqual(proof.actualReallocControl, build.manifest.reallocAttempt);
  assert.equal(proof.archive.path, `outputs/reports/realloc-native-sources-${runId}.json.gz`);
  const compressed = await read(proof.archive.path); assert.ok(compressed.length <= 2097152);
  assert.equal(compressed.length, proof.archive.bytes); assert.equal(sha(compressed), proof.archive.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(raw.length, proof.archive.restoredBytes); assert.equal(sha(raw), proof.archive.restoredSha256);
  const archive = JSON.parse(raw); assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(archive.currentSourcePins, proof.currentSourcePins);
  assert.deepEqual(Object.keys(archive.sourcePreimages).sort(), Object.keys(proof.sourcePins).sort()); assert.deepEqual(proof.postSourcePins, proof.currentSourcePins);
  const currentSourcePins = {};
  for (const [source, hash] of Object.entries(proof.sourcePins)) {
    assert.match(source, /^(?:(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+|tests\/mpeg2-realloc-attempt\.test\.mjs)$/);
    assert.ok(source.split("/").every(part => part && part !== "." && part !== ".."));
    const row = archive.sourcePreimages[source]; assert.equal(row.encoding, "base64"); assert.equal(typeof row.data, "string"); assert.ok(row.data.length <= Math.ceil(2097152 / 3) * 4);
    const bytes = Buffer.from(row.data, "base64"); assert.equal(bytes.toString("base64"), row.data); assert.ok(bytes.length <= 2097152); assert.equal(sha(bytes), hash, source);
    currentSourcePins[source] = sha(await read(source));
    if (source === branch.workflow.path) {
      assert.equal(hash, branch.workflow.generatedSha256); assert.equal(bytes.toString(), branch.workflow.generatedExactSource); assert.equal(currentSourcePins[source], branch.workflow.canonicalSha256);
    } else assert.equal(currentSourcePins[source], hash, source);
  }
  assert.deepEqual(currentSourcePins, proof.currentSourcePins);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256); assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  return { path: file, sha256: sha(proofBytes), sourceCount: 86, archive: proof.archive, currentSourcePins,
    allExecutedNativePreimagesVerified: true, unchanged128File2MiBEnvelopeCaps: true, publicAcceptance: false };
}
