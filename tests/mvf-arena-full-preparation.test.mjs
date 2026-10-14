import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/mvf-arena-full-sources.mjs";
import { makeEbmlFullSupervisor } from "../scripts/lib/mvf-arena-full-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("changed supervisor keeps hidden birth-qualified/no-restart protocol and targets only the new entry", async () => {
  const recipe = await makeEbmlFullSupervisor((await read("scripts/launch-packet-largest-idle-supervisor.mjs")).toString(), root);
  assert.ok(recipe.generated.includes('own = "scripts/run-mvf-arena-full.mjs"'));
  assert.ok(recipe.generated.includes('windowsHide: true')); assert.ok(recipe.generated.includes("noAutomaticRestart: true"));
  assert.ok(recipe.generated.includes("mvf-arena-supervisor"));
  assert.ok(!recipe.generated.includes('scripts/run-ebml-reuse-full.mjs'));
});
test("actual prepared588-source full harness recovers all prior546 and every added preimage within unchanged caps", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-14T22-37-12-514Z-mvf-arena-original-full-preparation.json"));
  const previous = JSON.parse(await read("evidence/2026-10-14T19-03-00-388Z-ebml-reuse-original-full-terminal.json"));
  assert.equal(proof.status, "prepared-not-executed"); assert.equal(proof.executions, 0);
  assert.equal(Object.keys(proof.sourcePins).length, 588); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  const archive = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.equal(Object.keys(archive.sourcePreimages).length, 588);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash); assert.equal(sha(await read(file)), hash, file);
  }
  for (const [file, hash] of Object.entries(previous.sourcePins)) assert.equal(proof.sourcePins[file], hash);
  assert.equal(proof.sourceLayers.parentFilesRetained, 508); assert.equal(proof.sourceLayers.extensionFiles, 80);
  assert.equal(proof.sourceLayers.limits.extensionFiles, 128); assert.equal(proof.sourceLayers.limits.extensionRestoredBytes, 2097152);
  assert.equal(proof.sourceLayers.limits.externalFiles, 16);
  assert.equal(Object.values(archive.extensionPreimages).filter(row => row.encoding === "qualified-external").length, 16);
  assert.ok(archive.generated.includes("scripts/stage-mvf-arena-full.mjs"));
  assert.ok(archive.generated.includes("mvf-arena-full-failure.mjs"));
});
test("actual preparation preserves whole original, checks host/disk, retains3-run250MiB gates and cleans without acceptance", async () => {
  const p = JSON.parse(await read("evidence/2026-10-14T22-37-12-514Z-mvf-arena-original-full-preparation.json"));
  assert.equal(p.protectedBefore.bytes, 2958573265); assert.equal(p.protectedBefore.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(p.protectedBefore, p.protectedAfter); assert.equal(p.hostPreflight.safeToStart, true); assert.ok(p.diskPreflightBytes >= 32 * 1024 ** 3);
  assert.equal(p.requestedRuns, 3); assert.equal(p.maximumConversionMsPerRun, 21600000); assert.equal(p.primaryLimitMiB, 250);
  assert.equal(p.composition.manifest.artifacts["within-mpeg2-split.wasm"], "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576");
  assert.equal(p.composition.manifest.artifacts["split-encoder.wasm"], "a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee");
  assert.equal(p.wrapperAbsent, true); assert.equal(p.candidateAbsent, true); assert.equal(p.productionRestored, true);
  for (const directory of [p.wrapper, p.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
  assert.equal(p.originalFullSourceAcceptance, false); assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.publicAcceptance, false);
});
