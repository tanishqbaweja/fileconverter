import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-cache-layered-source-archive.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = name => readFile(path.join(root, name));
const proofPath = "evidence/2026-10-12T09-54-13-838Z-packet-cache-original-full-preparation.json";
const proof = JSON.parse(await read(proofPath));
const supervisor = JSON.parse(await read("evidence/2026-10-12T09-54-13-126Z-packet-cache-supervisor-prepare-only.json"));

test("actual detached preparation command completes in12.6s, cleans runtime and does not execute or accept a conversion", async () => {
  assert.equal(supervisor.mode, "--prepare-only"); assert.equal(supervisor.failure, null);
  assert.equal(supervisor.status, "command-completed-not-conversion-acceptance");
  assert.deepEqual(supervisor.childExit, { code: 0, signal: null, error: null });
  assert.equal(supervisor.runtimeRemoved, true); await assert.rejects(access(supervisor.runtimeDirectory), { code: "ENOENT" });
  const output = JSON.parse(Buffer.from(supervisor.stdout.tailBase64, "base64").toString("utf8"));
  assert.equal(output.output, proofPath); assert.equal(output.executions, 0);
  assert.equal(supervisor.conversionAcceptance, false); assert.equal(supervisor.nativeMemorySamplesRecovered, false);
  for (const [file, pin] of Object.entries(supervisor.sourcePins)) {
    const bytes = await read(file); assert.equal(sha(bytes), pin); assert.deepEqual(bytes, Buffer.from(supervisor.sourcePreimages[file], "base64"));
  }
});

test("supervised preparation joins all333 actual source preimages/current/post and preserves fixed memory, fidelity and run gates", async () => {
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePreimages).length, 333); assert.deepEqual(archive.sourcePins, proof.sourcePins);
  assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, pin] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), pin, file);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.maximumConversionMsPerRun, 21600000);
  assert.equal(proof.primaryLimitMiB, 250); assert.equal(proof.nativeBitRate, 4000000);
  assert.equal(proof.sourceLayers.limits.additiveRestoredBytes, 2097152); assert.equal(proof.sourceLayers.limits.combinedFiles, 384);
  assert.equal(proof.composition.manifest.artifacts["within-mpeg2-split.wasm"], "4421339c802d2031c27c6c62ee948174b454797a7176d338cfe451b19c2945cb");
});

test("new preparation whole original hashes, disk/host guards and exact owned cleanup pass without full/speed/memory/public acceptance", async () => {
  assert.deepEqual(proof.protectedBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34", wholeFileReadOnly: true });
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.hostPreflight.safeToStart, true);
  assert.ok(proof.diskPreflightBytes >= 32 * 1024 ** 3); assert.equal(proof.executions, 0);
  assert.equal(proof.productionRestored, true); assert.equal(proof.wrapperAbsent, true); assert.equal(proof.candidateAbsent, true);
  for (const directory of [proof.wrapper, proof.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  for (const field of ["originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"])
    assert.equal(proof[field], false, field);
});
