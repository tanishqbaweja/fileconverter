import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-cache-layered-source-archive.mjs";
import { makeAllocationAttemptFullDriver as durable } from "../scripts/lib/durable-packet-cache-full-recipe.mjs";
import { makeAllocationAttemptFullDriver as prior } from "../scripts/lib/packet-cache-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-12T10-12-17-079Z-packet-cache-original-full-preparation.json"));

test("actual346-source preparation stays under unchanged evidence caps, retains original333 plus13 additions and exact sidecar edits", async () => {
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePreimages).length, 346); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins); assert.equal(proof.sourceLayers.additiveFiles, 90);
  assert.ok(proof.sourceArchive.restoredBytes < 2097152); assert.equal(proof.sourceLayers.limits.additiveRestoredBytes, 2097152);
  const oldProof = JSON.parse(await read("evidence/2026-10-12T05-48-04-956Z-packet-cache-original-full-preparation.json"));
  for (const [file, pin] of Object.entries(oldProof.sourcePins)) assert.equal(proof.sourcePins[file], pin, file);
  const name = path.basename(proof.candidateDirectory);
  const original = await prior(root, proof.wrapper, name, Object.keys(proof.sourcePins));
  const current = await durable(root, proof.wrapper, name, Object.keys(proof.sourcePins));
  assert.equal(sha(archive.generated), current.generatedSha256);
  let reversed = current.generated;
  for (const [before, after, count = 1] of current.durableObserverEdits.toReversed()) {
    assert.equal(reversed.split(after).length - 1, count); reversed = reversed.replaceAll(after, before);
  }
  assert.equal(reversed, original.generated); assert.equal(current.durableObserverEdits.length, 2);
  assert.ok(current.generated.includes("checkpointPath: reportBase + '-native-checkpoint.json'"));
});

test("real new preparation preserves complete protected source, three runs/six-hour/4Mbps/250MiB gates and cleans all owned scratch", async () => {
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter);
  assert.equal(proof.protectedBefore.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protectedBefore.bytes, 2958573265); assert.equal(proof.hostPreflight.safeToStart, true);
  assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3); assert.equal(proof.executions, 0);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  assert.equal(proof.nativeBitRate, 4000000); assert.equal(proof.primaryLimitMiB, 250);
  assert.equal(proof.productionRestored, true); assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  for (const key of ["originalFullSourceAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance", "publicAcceptance"])
    assert.equal(proof[key], false, key);
});
