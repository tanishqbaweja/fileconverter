// Actual failed Wasm control and versioned source evidence; never media success.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/realloc-build-38523571937-failure.json"));
async function restore(row, maximum) {
  const zipped = await read(row.path); assert.equal(zipped.length, row.bytes); assert.equal(sha(zipped), row.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: maximum }); assert.equal(bytes.length, row.restoredBytes); assert.equal(sha(bytes), row.restoredSha256);
  return bytes;
}
test("actual exact-head native build fails aliased-buffer scalar assertion, no candidate/artifact/media claim, hosted cleanup passes", () => {
  assert.equal(proof.run.databaseId, 38523571937); assert.equal(proof.run.headSha, "f366cbb5563e51273fad20d295bdd09f2a5dcaf6");
  assert.equal(proof.run.status, "completed"); assert.equal(proof.run.conclusion, "failure");
  assert.ok(proof.firstAssertion.includes("within_realloc_attempt_words[9] == 8192 && within_realloc_attempt_words[11] == 2"));
  assert.equal(proof.observedOldSizeWord, null); assert.equal(proof.observedRefcountWord, null);
  assert.equal(proof.noCandidateArtifacts, true); assert.equal(proof.hostedBuildCleanupPassed, true);
  assert.equal(proof.run.jobs[0].steps.find(x => x.name === "Remove repository-local build data").conclusion, "success");
  for (const flag of ["originalRead", "nativeFailureRequestProven", "fullOriginalAcceptance", "publicAcceptance"]) assert.equal(proof[flag], false);
  assert.equal(proof.browserConversions, 0);
});
test("all86 failed-head native source preimages and complete job log survive corrected current code", async () => {
  const archive = JSON.parse(await restore(proof.sourceArchive, 2097152)); assert.deepEqual(archive.pins, proof.sourcePins);
  assert.equal(Object.keys(archive.preimages).length, 86); assert.equal(proof.failedGitHeadSourceCount, 86);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  const file = "media/ffmpeg/mpeg2-realloc-attempt.c", old = Buffer.from(archive.preimages[file], "base64").toString();
  assert.ok(!old.includes("Preserve the OUTER owner scalars"));
  const current = await read(file); assert.ok(current.toString().includes("Preserve the OUTER owner scalars")); assert.notEqual(sha(current), proof.sourcePins[file]);
  const log = (await restore(proof.logArchive, 16777216)).toString(); assert.ok(log.includes(proof.firstAssertion));
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
});
