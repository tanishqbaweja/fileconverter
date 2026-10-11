import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectFailedAllocationAttemptFull } from "../scripts/analyze-allocation-attempt-full-terminal.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("actual terminal independent audit joins two current analysis preimages, exact failed raw archive, all24 absent births and honest non-acceptance", async () => {
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T14-01-14-330Z-allocation-attempt-original-full-terminal-analysis.json")));
  assert.equal(proof.failure, null); assert.equal(proof.all312CurrentPrePostPreimageJoins, true);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.equal(Object.keys(proof.sourcePins).length, 2);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root, file))), hash); assert.equal(sha(Buffer.from(proof.sourcePreimages[file].data, "base64")), hash);
  }
  assert.equal(sha(await readFile(path.join(root, proof.terminal.path))), proof.terminal.sha256);
  const record = proof.rawArchive, zipped = await readFile(path.join(root, record.path)), bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(zipped.length, 528647); assert.equal(sha(zipped), record.sha256); assert.equal(bytes.length, 16636060); assert.equal(sha(bytes), record.restoredSha256);
  assert.deepEqual(inspectFailedAllocationAttemptFull(JSON.parse(bytes)), proof.result);
  assert.equal(proof.independentlyObservedOwnedAbsence.length, 24);
  for (const absence of proof.independentlyObservedOwnedAbsence) { assert.equal(absence.status, "owned-identity-absent"); assert.equal(absence.noProcessesKilled, true); }
  assert.equal(proof.ownedScratchAbsent, true); assert.equal(proof.stockUiRestored, true); assert.equal(proof.redundantRawDeletedAfterByteExactArchive, true);
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.result.completedConversions, 0);
  const terminal = JSON.parse(await readFile(path.join(root, proof.terminal.path)));
  for (const directory of [terminal.wrapper, terminal.candidateDirectory, JSON.parse(bytes).runtimeDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  const base = "outputs/reports/2026-10-11T14-02-10-924Z-private-mpeg2-allocation-attempt-full-native-100ms";
  await assert.rejects(access(path.join(root, base + ".json")), { code: "ENOENT" });
  for (const [suffix, length] of [[".csv", 70228], [".html", 39521], ["-trace.zip", 194117]]) assert.equal((await readFile(path.join(root, base + suffix))).length, length);
});
